import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { listDishes, getMapDishes } from '../../lib/api';
import type { MapDish } from '../../lib/api';
import type { DishSummary } from '../../types/dish';

// IMPORTANT: maplibre-gl is dynamically imported inside the effect, NOT
// statically imported at the top. A static import executes at module-eval
// time, which means the component would try to evaluate MapLibre's WebGL
// helpers during Astro SSR and crash the build / blank the island. The
// dynamic import keeps the initial payload tiny and defers the WebGL
// dependency until the user actually sees the map. This mirrors the
// pattern already used by <WorldMap> and <DishMap>.
//
// Type-only imports below are erased at build time — no runtime cost, no
// module evaluation.
import type {
  Map as MlMap,
  MapMouseEvent,
  GeoJSONSource,
  StyleSpecification,
} from 'maplibre-gl';

type ViewMode = 'atlas' | 'index' | 'gallery' | 'feed';
type SortKey = 'name' | 'origin' | 'family';

/**
 * One unified record per dish, merged from two API endpoints:
 *  - GET /api/dishes      → name, origin country, dish-type family, description
 *  - GET /api/dishes/map  → lat/lng + region (only dishes that have coords)
 *
 * Every view (Atlas map + sidebar, Index, Gallery, Feed) and the filter
 * controls all read from this single shape, so the map markers and the
 * lists always follow the exact same filtered dataset.
 */
interface AtlasDish {
  slug: string;
  name: string;
  /** Origin country/place. '' when unknown. */
  country: string;
  /** Primary dish-type category ("Noodle soup", "Stew"…). '' when unknown. */
  family: string;
  description: string;
  lat: number | null;
  lng: number | null;
  /** True when the dish has usable origin coordinates. */
  hasLocation: boolean;
}

function mergeDishes(list: DishSummary[], map: MapDish[]): AtlasDish[] {
  const mapBySlug = new Map(map.map((m) => [m.slug, m]));
  return list.map((d) => {
    const m = mapBySlug.get(d.slug);
    const lat =
      typeof m?.lat === 'number' && Number.isFinite(m.lat) ? m.lat : null;
    const lng =
      typeof m?.lng === 'number' && Number.isFinite(m.lng) ? m.lng : null;
    return {
      slug: d.slug,
      name: d.canonicalName,
      country: d.originName ?? m?.region?.name ?? '',
      family: d.familyName ?? '',
      description: d.shortDescription ?? '',
      lat,
      lng,
      hasLocation: lat !== null && lng !== null,
    };
  });
}

// Cheap synchronous WebGL probe — the same guard used by <WorldMap> /
// <DishMap>. If the browser can't get a WebGL context we never fetch the
// ~1MB maplibre-gl bundle; we render the sidebar list as the fallback.
function detectWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')) as unknown as
      | WebGLRenderingContext
      | null;
    if (!gl) return false;
    gl.getParameter(gl.VERSION);
    return true;
  } catch {
    return false;
  }
}

// Carto positron-voyager raster basemap — same look as the standalone
// /map page and the per-dish mini-map. Free, no API key, OSM-derived.
const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'carto-positron': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: 'carto-positron-layer',
      type: 'raster',
      source: 'carto-positron',
    },
  ],
};

function toFeatureCollection(dishes: AtlasDish[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: dishes.map((d) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [d.lng as number, d.lat as number] },
      properties: {
        slug: d.slug,
        name: d.name,
        country: d.country,
        family: d.family,
      },
    })),
  };
}

// ─── Atlas view ─────────────────────────────────────────────────────────────

function AtlasView({ dishes }: { dishes: AtlasDish[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  // True once the GeoJSON source/layers exist — gates marker updates.
  const [styleLoaded, setStyleLoaded] = useState(false);
  // True once the dynamic import resolves (hides the loading hint).
  const [mapReady, setMapReady] = useState(false);
  // Set when the map can't render at all (no WebGL, init failure, bundle
  // load failure). Triggers the list-only fallback instead of a blank box.
  const [mapError, setMapError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  // Dishes with usable coordinates — the only ones that can be plotted.
  const plotted = useMemo(() => dishes.filter((d) => d.hasLocation), [dishes]);

  // Sidebar: every filtered dish grouped by origin country (not just the
  // plotted ones — the list is useful even without coords).
  const byRegion = useMemo(() => {
    const groups = new Map<string, AtlasDish[]>();
    for (const d of dishes) {
      const key = d.country || 'Unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([region, items]) => ({
        region,
        items: items.slice().sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [dishes]);

  // Initialise the map once on mount. Marker data is pushed separately by
  // the effect below whenever the filtered set changes.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let map: MlMap | null = null;

    if (!detectWebGL()) {
      // eslint-disable-next-line no-console
      console.warn('[GustaleHome] WebGL unavailable — showing list fallback');
      setMapError(
        'Your browser does not support WebGL, which is required for the interactive map. Browse the list of dishes instead.',
      );
      setMapReady(true);
      return;
    }

    void import('maplibre-gl')
      .then((mod) => {
        if (cancelled) return;
        const maplibregl = mod.default ?? mod;

        const accent =
          (typeof document !== 'undefined' &&
            getComputedStyle(document.documentElement)
              .getPropertyValue('--accent')
              .trim()) ||
          '#B8552F';

        try {
          map = new maplibregl.Map({
            container: containerRef.current!,
            style: MAP_STYLE,
            center: [20, 20],
            zoom: 1.4,
            minZoom: 0.5,
            maxZoom: 16,
            attributionControl: { compact: true },
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[GustaleHome] MapLibre init failed:', err);
          setMapError(
            'The interactive map could not be initialised in this browser. Browse the list of dishes instead.',
          );
          setMapReady(true);
          return;
        }

        const mapInstance = map;

        mapInstance.on('error', (e: { error?: Error }) => {
          // eslint-disable-next-line no-console
          console.warn('[GustaleHome] MapLibre error:', e?.error?.message ?? e);
        });

        mapInstance.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          'top-right',
        );

        mapRef.current = mapInstance;
        setMapReady(true);

        mapInstance.on('load', () => {
          if (cancelled) return;

          mapInstance.addSource('atlas', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            cluster: true,
            clusterRadius: 34,
            clusterMaxZoom: 6,
          });

          // Soft halo behind each individual dot.
          mapInstance.addLayer({
            id: 'atlas-halo',
            type: 'circle',
            source: 'atlas',
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-radius': 11,
              'circle-color': accent,
              'circle-opacity': 0.2,
            },
          });

          // Solid dot.
          mapInstance.addLayer({
            id: 'atlas-dot',
            type: 'circle',
            source: 'atlas',
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-radius': 5.5,
              'circle-color': accent,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1.5,
            },
          });

          // Cluster bubbles + counts.
          mapInstance.addLayer({
            id: 'atlas-clusters',
            type: 'circle',
            source: 'atlas',
            filter: ['has', 'point_count'],
            paint: {
              'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 25, 26],
              'circle-color': accent,
              'circle-opacity': 0.85,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            },
          });
          mapInstance.addLayer({
            id: 'atlas-cluster-count',
            type: 'symbol',
            source: 'atlas',
            filter: ['has', 'point_count'],
            layout: {
              'text-field': '{point_count_abbreviated}',
              'text-size': 12,
            },
            paint: { 'text-color': '#ffffff' },
          });

          // Click a dot → open the dish. Click a cluster → zoom in.
          const onDotClick = (
            e: MapMouseEvent & { features?: GeoJSON.Feature[] },
          ): void => {
            const slug = e.features?.[0]?.properties?.slug as string | undefined;
            if (slug) window.location.href = `/dishes/${slug}`;
          };
          const onClusterClick = (
            e: MapMouseEvent & { features?: GeoJSON.Feature[] },
          ): void => {
            const f = e.features?.[0];
            const clusterId = f?.properties?.cluster_id as number | undefined;
            if (clusterId == null) return;
            const src = mapInstance.getSource('atlas') as GeoJSONSource;
            src
              .getClusterExpansionZoom(clusterId)
              .then((zoom) => {
                const coords = (f!.geometry as GeoJSON.Point).coordinates as [
                  number,
                  number,
                ];
                mapInstance.easeTo({ center: coords, zoom, duration: 500 });
              })
              .catch(() => undefined);
          };

          for (const layer of ['atlas-dot', 'atlas-halo']) {
            mapInstance.on('click', layer, onDotClick);
            mapInstance.on('mouseenter', layer, () => {
              mapInstance.getCanvas().style.cursor = 'pointer';
            });
            mapInstance.on('mouseleave', layer, () => {
              mapInstance.getCanvas().style.cursor = '';
            });
          }
          mapInstance.on('click', 'atlas-clusters', onClusterClick);
          mapInstance.on('mouseenter', 'atlas-clusters', () => {
            mapInstance.getCanvas().style.cursor = 'pointer';
          });
          mapInstance.on('mouseleave', 'atlas-clusters', () => {
            mapInstance.getCanvas().style.cursor = '';
          });

          setStyleLoaded(true);
        });
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn('[GustaleHome] failed to load maplibre-gl', err);
        if (cancelled) return;
        setMapError(
          'The interactive map could not be loaded. Browse the list of dishes instead.',
        );
        setMapReady(true);
      });

    return () => {
      cancelled = true;
      if (map) map.remove();
      mapRef.current = null;
      setStyleLoaded(false);
    };
  }, []);

  // Push the current (filtered) dish set onto the map whenever it changes,
  // so the markers always match the lists/sidebar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    const src = map.getSource('atlas') as GeoJSONSource | undefined;
    if (src) src.setData(toFeatureCollection(plotted));
  }, [plotted, styleLoaded]);

  return (
    <div className="atl-grid">
      <div className="atl-map">
        <div className="atl-mapbox">
          <div
            ref={containerRef}
            style={{ width: '100%', height: '100%', display: mapError ? 'none' : 'block' }}
            aria-label="Interactive map of dish origins"
          />
          {!mapReady && !mapError && (
            <div className="atl-mapmsg">Loading map…</div>
          )}
          {mapError && (
            <div className="atl-mapmsg atl-mapmsg--err">{mapError}</div>
          )}
        </div>
        <div className="atl-maplabel">
          <span>{plotted.length} dishes plotted</span>
          <span>© OpenStreetMap · CARTO</span>
        </div>
      </div>
      <div className="atl-list">
        {byRegion.map(({ region, items }) => (
          <div key={region}>
            <div className="atl-region-h">
              {region} — {items.length}
            </div>
            {items.map((d) => (
              <a
                key={d.slug}
                href={`/dishes/${d.slug}`}
                className="atl-item"
                data-active={active === d.slug ? '1' : '0'}
                onMouseEnter={() => setActive(d.slug)}
                onMouseLeave={() => setActive(null)}
              >
                <span className="nm">{d.name}</span>
                <span className="co">{d.family}</span>
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

function IndexView({ dishes }: { dishes: AtlasDish[] }) {
  const [sort, setSort] = useState<SortKey>('name');

  const sorted = useMemo(() => {
    return [...dishes].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'origin') return a.country.localeCompare(b.country);
      if (sort === 'family') return a.family.localeCompare(b.family);
      return 0;
    });
  }, [dishes, sort]);

  return (
    <div className="idx-wrap">
      <div className="idx-head">
        <span onClick={() => setSort('name')}>Name {sort === 'name' ? '↑' : ''}</span>
        <span onClick={() => setSort('origin')}>Origin {sort === 'origin' ? '↑' : ''}</span>
        <span onClick={() => setSort('family')}>Family {sort === 'family' ? '↑' : ''}</span>
        <span>Description</span>
      </div>
      {sorted.map((d) => (
        <a key={d.slug} href={`/dishes/${d.slug}`} className="idx-row">
          <span className="name">{d.name}</span>
          <span className="org">{d.country || '—'}</span>
          <span className="idx-tag">{d.family || '—'}</span>
          <span style={{ color: 'var(--sub)', fontSize: '14px' }}>{d.description}</span>
        </a>
      ))}
    </div>
  );
}

// ─── Gallery view ────────────────────────────────────────────────────────────

function GalleryView({ dishes }: { dishes: AtlasDish[] }) {
  return (
    <div className="gal">
      {dishes.map((d) => (
        <a key={d.slug} href={`/dishes/${d.slug}`} className="gal-card">
          <div className="ph" style={{ background: 'var(--accent-soft)', height: '180px', borderRadius: '6px' }} />
          <h3>{d.name}</h3>
          <div className="place">{d.country || '—'}</div>
          <p className="note-long">{d.description}</p>
        </a>
      ))}
    </div>
  );
}

// ─── Feed view ──────────────────────────────────────────────────────────────

function FeedView({ dishes }: { dishes: AtlasDish[] }) {
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
            <div className="place">{d.country || '—'}</div>
            <h3>{d.name}</h3>
            <p>{d.description}</p>
            <div className="feed-meta">
              <span>Family <b>{d.family || '—'}</b></span>
              <span>Origin <b>{d.country || '—'}</b></span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

// ─── Main island ─────────────────────────────────────────────────────────────

export default function GustaleHomeIsland() {
  const [view, setView] = useState<ViewMode>('atlas');
  const [dishes, setDishes] = useState<AtlasDish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [family, setFamily] = useState('');
  const [exactOnly, setExactOnly] = useState(false);

  // Load the full dataset once on hydration, merging the list + map
  // endpoints. A map-endpoint failure must NOT blank the homepage — we
  // fall back to the list data with no coordinates. Only a list-endpoint
  // failure surfaces an error (and even then the hero still renders).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.allSettled([
      listDishes({ limit: 200 }),
      getMapDishes({ limit: 2000 }),
    ])
      .then(([listRes, mapRes]) => {
        if (cancelled) return;
        if (listRes.status === 'fulfilled') {
          const mapDishes =
            mapRes.status === 'fulfilled' ? mapRes.value.dishes : [];
          setDishes(mergeDishes(listRes.value.dishes, mapDishes));
        } else {
          // eslint-disable-next-line no-console
          console.warn('[GustaleHome] dish list fetch failed:', listRes.reason);
          setError(
            listRes.reason instanceof Error
              ? listRes.reason.message
              : 'Failed to load dishes',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Dropdown options derived from the loaded data (not hardcoded).
  const countryOptions = useMemo(
    () =>
      Array.from(new Set(dishes.map((d) => d.country).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [dishes],
  );
  const familyOptions = useMemo(
    () =>
      Array.from(new Set(dishes.map((d) => d.family).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [dishes],
  );

  // The single filtered dataset every view + the map reads from.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dishes.filter((d) => {
      if (country && d.country !== country) return false;
      if (family && d.family !== family) return false;
      if (exactOnly && !d.hasLocation) return false;
      if (q) {
        const hay = `${d.name} ${d.country} ${d.family} ${d.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [dishes, search, country, family, exactOnly]);

  const hasActiveFilters = Boolean(search || country || family || exactOnly);
  const resetFilters = useCallback(() => {
    setSearch('');
    setCountry('');
    setFamily('');
    setExactOnly(false);
  }, []);

  const total = dishes.length;
  const shown = filtered.length;
  const plottedCount = useMemo(
    () => dishes.filter((d) => d.hasLocation).length,
    [dishes],
  );

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
              placeholder="Search dishes — ramen, Japan, stew…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search dishes"
            />
            <button aria-label="Search">⌕</button>
          </div>
          <div className="hero-meta">
            <div><b>{total}</b> dishes</div>
            <div><b>{familyOptions.length}</b> families</div>
            <div><b>{countryOptions.length}</b> origins</div>
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
            <span>{plottedCount} dishes plotted</span>
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
                : `${shown} of ${total} dish${total !== 1 ? 'es' : ''}`}
            </p>
          </div>
          <span className="ws-count">
            {view === 'atlas' ? 'Map' : view === 'index' ? 'Table' : view === 'gallery' ? 'Cards' : 'Stories'} view
          </span>
        </div>

        {/* Filter bar — stacks above the views on mobile, sits inline on
            desktop. Options are generated from the loaded data. */}
        <div className="ws-filters">
          <input
            className="filt-search"
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search dishes"
          />
          <select
            className="filt-select"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Filter by region or country"
          >
            <option value="">All regions</option>
            {countryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            className="filt-select"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {familyOptions.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <label className="filt-toggle">
            <input
              type="checkbox"
              checked={exactOnly}
              onChange={(e) => setExactOnly(e.target.checked)}
            />
            Only exact locations
          </label>
          <button
            className="filt-reset"
            type="button"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
          >
            Reset
          </button>
          <span className="filt-count">
            Showing {shown} dish{shown === 1 ? '' : 'es'}
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
        ) : error ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--sub)' }}>
            Couldn't load dishes right now. Please try again in a moment.
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--sub)' }}>
            No dishes match your filters.
            {hasActiveFilters && (
              <>
                {' '}
                <button
                  type="button"
                  className="filt-reset"
                  style={{ marginLeft: 8 }}
                  onClick={resetFilters}
                >
                  Reset filters
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {view === 'atlas' && <AtlasView dishes={filtered} />}
            {view === 'index' && <IndexView dishes={filtered} />}
            {view === 'gallery' && <GalleryView dishes={filtered} />}
            {view === 'feed' && <FeedView dishes={filtered} />}
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
