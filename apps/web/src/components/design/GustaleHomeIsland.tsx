import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { listDishes } from '../../lib/api';
import type { DishListResponse } from '../../types/dish';

// MapLibre — loaded from CDN on demand
let mapLoaded = false;
let mapLoading = false;
const loadCallbacks: Array<() => void> = [];
function ensureMapLibre(cb: () => void) {
  if (mapLoaded) { cb(); return; }
  loadCallbacks.push(cb);
  if (mapLoading) return;
  mapLoading = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css';
  document.head.appendChild(link);
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js';
  script.onload = () => { mapLoaded = true; mapLoading = false; loadCallbacks.forEach(c => c()); loadCallbacks.length = 0; };
  document.head.appendChild(script);
}

// Map endpoint types
interface MapDish {
  slug: string;
  canonicalName: string;
  shortDescription: string | null;
  lat: number;
  lng: number;
  region: { name: string; localName: string | null; isoCode: string | null };
}

type ViewMode = 'atlas' | 'index' | 'gallery' | 'feed';
type SortKey = 'name' | 'origin' | 'family';

interface ParsedFilters {
  q: string;
  origin: string[];
  ingredient: string[];
  technique: string[];
  region: string[];
}

function parseQuery(raw: string): ParsedFilters {
  const tokens = raw.match(/(\S+):(\S+)/g) ?? [];
  const freetext = raw.replace(/(\S+):(\S+)/g, '').trim();
  const filters = { origin: [] as string[], ingredient: [] as string[], technique: [] as string[], region: [] as string[] };
  for (const tok of tokens) {
    const colon = tok.indexOf(':');
    const key = tok.slice(0, colon).toLowerCase();
    const val = tok.slice(colon + 1);
    if (key in filters) (filters as any)[key].push(val);
  }
  return { q: freetext, ...filters };
}

// ─── Atlas view ─────────────────────────────────────────────────────────────

function AtlasView({
  mapDishes,
  listDishes,
}: {
  mapDishes: MapDish[];
  listDishes: DishListResponse['dishes'];
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [active, setActive] = useState<string | null>(null);

  // Group list dishes by region for the sidebar
  const byRegion = useMemo(() => {
    const slugToList = new Map(listDishes.map(d => [d.slug, d]));
    const map = new Map<string, MapDish[]>();
    for (const d of mapDishes) {
      const r = d.region?.name ?? 'Unknown';
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(d);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([region, dishes]) => ({
        region,
        dishes: dishes.map(d => ({ ...d, list: slugToList.get(d.slug) })),
      }));
  }, [mapDishes, listDishes]);

  useEffect(() => {
    ensureMapLibre(() => {
      if (!mapRef.current || mapInstanceRef.current) return;
      const map = new (window as any).maplibregl.Map({
        container: mapRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors',
            },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 19 }],
        },
        center: [20, 20],
        zoom: 1.5,
        attributionControl: false,
      });
      map.addControl(new (window as any).maplibregl.NavigationControl(), 'top-right');
      mapInstanceRef.current = map;
    });
  }, []);

  return (
    <div className="atl-grid">
      <div className="atl-map">
        <div ref={mapRef} className="atl-mapbox" style={{ height: '460px' }} />
        <div className="atl-maplabel">
          <span>{mapDishes.length} dishes plotted</span>
          <span>© OpenStreetMap</span>
        </div>
      </div>
      <div className="atl-list">
        {byRegion.map(({ region, dishes }) => (
          <div key={region}>
            <div className="atl-region-h">{region} — {dishes.length}</div>
            {dishes.map(d => (
              <a
                key={d.slug}
                href={`/dishes/${d.slug}`}
                className="atl-item"
                data-active={active === d.slug ? '1' : '0'}
                onMouseEnter={() => setActive(d.slug)}
                onMouseLeave={() => setActive(null)}
              >
                <span className="nm">{d.canonicalName}</span>
                <span className="co">{d.list?.methodSlug ?? ''}</span>
                <span className="cd">{region}</span>
              </a>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Index view ─────────────────────────────────────────────────────────────

function IndexView({ dishes }: { dishes: DishListResponse['dishes'] }) {
  const [sort, setSort] = useState<SortKey>('name');

  const sorted = useMemo(() => {
    return [...dishes].sort((a, b) => {
      if (sort === 'name') return a.canonicalName.localeCompare(b.canonicalName);
      if (sort === 'origin') return (a.originName ?? '').localeCompare(b.originName ?? '');
      if (sort === 'family') return (a.methodSlug ?? '').localeCompare(b.methodSlug ?? '');
      return 0;
    });
  }, [dishes, sort]);

  return (
    <div className="idx-wrap">
      <div className="idx-head">
        <span onClick={() => setSort('name')}>Name {sort === 'name' ? '↑' : ''}</span>
        <span onClick={() => setSort('origin')}>Origin {sort === 'origin' ? '↑' : ''}</span>
        <span onClick={() => setSort('family')}>Family</span>
        <span>Description</span>
      </div>
      {sorted.map(d => (
        <a key={d.slug} href={`/dishes/${d.slug}`} className="idx-row">
          <span className="name">{d.canonicalName}</span>
          <span className="org">{d.originName ?? '—'}</span>
          <span className="idx-tag">{d.methodSlug ?? '—'}</span>
          <span style={{ color: 'var(--sub)', fontSize: '14px' }}>{d.shortDescription ?? ''}</span>
        </a>
      ))}
    </div>
  );
}

// ─── Gallery view ────────────────────────────────────────────────────────────

function GalleryView({ dishes }: { dishes: DishListResponse['dishes'] }) {
  return (
    <div className="gal">
      {dishes.map(d => (
        <a key={d.slug} href={`/dishes/${d.slug}`} className="gal-card">
          <div className="ph" style={{ background: 'var(--accent-soft)', height: '180px', borderRadius: '6px' }} />
          <h3>{d.canonicalName}</h3>
          <div className="place">{d.originName ?? '—'}</div>
          <p className="note-long">{d.shortDescription ?? ''}</p>
        </a>
      ))}
    </div>
  );
}

// ─── Feed view ──────────────────────────────────────────────────────────────

function FeedView({ dishes }: { dishes: DishListResponse['dishes'] }) {
  return (
    <div className="feed">
      {dishes.map((d, i) => (
        <a
          key={d.slug}
          href={`/dishes/${d.slug}`}
          className="feed-card"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <div
            className="feed-img"
            style={{
              background: `hsl(${30 + i * 7}, 40%, 82%)`,
              minHeight: '280px',
              display: 'block',
            }}
          />
          <div className="feed-txt">
            <div className="place">{d.originName ?? '—'}</div>
            <h3>{d.canonicalName}</h3>
            <p>{d.shortDescription ?? ''}</p>
            <div className="feed-meta">
              <span>Family <b>{d.methodSlug ?? '—'}</b></span>
              <span>Origin <b>{d.originName ?? '—'}</b></span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

// ─── Filter chips ─────────────────────────────────────────────────────────────

function FilterChips({
  filters,
  onRemove,
}: {
  filters: ParsedFilters;
  onRemove: (key: string, val: string) => void;
}) {
  const all = [
    ...filters.origin.map(v => ({ k: 'origin', v })),
    ...filters.ingredient.map(v => ({ k: 'ingredient', v })),
    ...filters.technique.map(v => ({ k: 'technique', v })),
    ...filters.region.map(v => ({ k: 'region', v })),
  ];
  if (all.length === 0) return null;
  return (
    <div className="filter-chips">
      {all.map(({ k, v }) => (
        <button
          key={`${k}:${v}`}
          className="filter-chip"
          onClick={() => onRemove(k, v)}
        >
          {k}:{v}
          <span className="fc-x">×</span>
        </button>
      ))}
    </div>
  );
}

// ─── Main island ─────────────────────────────────────────────────────────────

export default function GustaleHomeIsland() {
  const [view, setView] = useState<ViewMode>('atlas');
  const [search, setSearch] = useState('');
  const [listData, setListData] = useState<DishListResponse | null>(null);
  const [mapDishes, setMapDishes] = useState<MapDish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseQuery(search), [search]);

  // Fetch list data (Index, Gallery, Feed, Atlas sidebar)
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      const params: any = { limit: 100 };
      if (parsed.q) params.search = parsed.q;
      if (parsed.origin[0]) params.origin = parsed.origin[0];
      if (parsed.ingredient[0]) params.ingredient = parsed.ingredient[0];
      if (parsed.technique[0]) params.technique = parsed.technique[0];
      if (parsed.region[0]) params.region = parsed.region[0];
      listDishes(params)
        .then(setListData)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [parsed]);

  // Fetch map data (Atlas pins) — only when Atlas view is active or could be
  useEffect(() => {
    if (view !== 'atlas') return;
    ensureMapLibre(() => {
      fetch('/api/dishes/map')
        .then(r => r.json())
        .then((data: { dishes: MapDish[] }) => setMapDishes(data.dishes ?? []))
        .catch(() => {});
    });
  }, [view]);

  const removeFilter = useCallback((key: string, val: string) => {
    const regex = new RegExp(`${key}:${val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    setSearch(prev => prev.replace(regex, '').replace(/\s+/g, ' ').trim());
  }, []);

  const listDishes_data = listData?.dishes ?? [];
  const total = listDishes_data.length;

  return (
    <main className="gst">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="gst-hero wrap">
        <div className="hero-content">
          <p className="kicker">Browse the atlas · {total} dishes</p>
          <h1 className="hero-h1">
            Browse the atlas<br /><em>your way.</em>
          </h1>
          <p className="hero-lede">
            Every dish has a country, but first it has a form. Explore Gustale
            by map, by name, by family, or by story.
          </p>
          <div className="hero-search">
            <input
              type="search"
              placeholder='Try "ramen", origin:Japan, ingredient:saffron…'
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button aria-label="Search">⌕</button>
          </div>
          <FilterChips filters={parsed} onRemove={removeFilter} />
          <div className="hero-meta">
            <div><b>{total}</b> dishes</div>
            <div><b>30+</b> families</div>
            <div><b>100+</b> origins</div>
          </div>
        </div>
        <div className="hero-frame">
          <div
            className="ph"
            style={{
              background:
                'repeating-conic-gradient(var(--accent-soft) 0% 25%, var(--card) 0% 50%) 0 0 / 40px 40px',
              borderRadius: '9px',
              height: '280px',
            }}
          />
          <div className="hero-coord">
            <span>0°N 0°E</span>
            <span>{mapDishes.length} dishes plotted</span>
          </div>
        </div>
      </section>

      {/* ── Workspace ────────────────────────────────────────────── */}
      <section className="workspace wrap">
        <div className="ws-head">
          <div>
            <h2>Explore</h2>
            <p>
              {loading
                ? 'Loading…'
                : `${total} dish${total !== 1 ? 's' : ''}${parsed.q ? ` matching "${parsed.q}"` : ''}`}
            </p>
          </div>
          <span className="ws-count">
            {view === 'atlas' ? 'Map' : view === 'index' ? 'Table' : view === 'gallery' ? 'Cards' : 'Stories'} view
          </span>
        </div>

        {/* Toolbar */}
        <div className="ws-toolbar">
          <span className="tb-label">View</span>
          <div className="seg">
            <button data-on={view === 'atlas' ? '1' : '0'} onClick={() => setView('atlas')}>
              <svg className="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="6" />
                <path d="M2 8h12M8 2c-2 2-3 4-3 6s1 4 3 6M8 2c2 2 3 4 3 6s-1 4-3 6" />
              </svg>
              Atlas
            </button>
            <button data-on={view === 'index' ? '1' : '0'} onClick={() => setView('index')}>
              <svg className="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 4h12M2 8h12M2 12h12" />
              </svg>
              Index
            </button>
            <button data-on={view === 'gallery' ? '1' : '0'} onClick={() => setView('gallery')}>
              <svg className="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="5" height="5" rx="1" />
                <rect x="9" y="2" width="5" height="5" rx="1" />
                <rect x="2" y="9" width="5" height="5" rx="1" />
                <rect x="9" y="9" width="5" height="5" rx="1" />
              </svg>
              Gallery
            </button>
            <button data-on={view === 'feed' ? '1' : '0'} onClick={() => setView('feed')}>
              <svg className="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 3h12v2H2zM2 7h8v2H2zM2 11h10v2H2z" />
              </svg>
              Feed
            </button>
          </div>
          <span className="tb-spacer" />
          {error && (
            <div className="alert alert-warning" style={{ margin: 0 }}>
              {error}
            </div>
          )}
        </div>

        {/* View panels */}
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--sub)', fontFamily: 'var(--mono)', fontSize: '14px' }}>
            Loading dishes…
          </div>
        ) : listDishes_data.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--sub)' }}>
            No dishes found{parsed.q ? ` for "${parsed.q}"` : ''}.
          </div>
        ) : (
          <>
            {view === 'atlas' && (
              <AtlasView mapDishes={mapDishes} listDishes={listDishes_data} />
            )}
            {view === 'index' && <IndexView dishes={listDishes_data} />}
            {view === 'gallery' && <GalleryView dishes={listDishes_data} />}
            {view === 'feed' && <FeedView dishes={listDishes_data} />}
          </>
        )}
      </section>

      {/* ── CTA band ──────────────────────────────────────────────── */}
      <div className="wrap" style={{ paddingBottom: '80px' }}>
        <div className="band">
          <div>
            <h2>
              Know a dish<br />we don't?
            </h2>
            <p>
              Gustale is built by people who cook, eat, and document. Every
              dish you add makes the atlas richer.
            </p>
          </div>
          <div className="band-cta">
            <button onClick={() => { window.location.href = '/dishes/new'; }}>
              Add a dish →
            </button>
            <small>Free forever. No account required to browse.</small>
          </div>
        </div>
      </div>
    </main>
  );
}
