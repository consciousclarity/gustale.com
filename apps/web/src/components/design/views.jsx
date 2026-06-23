/* GUSTALE — browse toolbar + the four browse-mode views.
   Each mode is a genuinely different way to scroll the same dataset. */

const Ph = window.Placeholder;

// ---- mode icons (simple shapes only) ----
const ModeIcon = ({ kind }) => {
  const s = { width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (kind === 'atlas') return (<svg viewBox="0 0 16 16" className="ic" {...s}><circle cx="8" cy="8" r="6.2" /><path d="M8 1.8v12.4M1.8 8h12.4M3.2 4.4c1.4 1 7.2 1 9.6 0M3.2 11.6c1.4-1 7.2-1 9.6 0" /></svg>);
  if (kind === 'index') return (<svg viewBox="0 0 16 16" className="ic" {...s}><path d="M2.5 4h11M2.5 8h11M2.5 12h11" /></svg>);
  if (kind === 'gallery') return (<svg viewBox="0 0 16 16" className="ic" {...s}><rect x="2.2" y="2.2" width="4.6" height="4.6" rx="1" /><rect x="9.2" y="2.2" width="4.6" height="4.6" rx="1" /><rect x="2.2" y="9.2" width="4.6" height="4.6" rx="1" /><rect x="9.2" y="9.2" width="4.6" height="4.6" rx="1" /></svg>);
  return (<svg viewBox="0 0 16 16" className="ic" {...s}><rect x="2.5" y="2.5" width="11" height="4" rx="1" /><rect x="2.5" y="9.5" width="11" height="4" rx="1" /></svg>);
};

const MODES = [
  { id: 'atlas', label: 'Atlas' },
  { id: 'index', label: 'Index' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'feed', label: 'Feed' },
];

const MODE_BLURB = {
  atlas: 'Surf by place — pan the map, follow the coast.',
  index: 'Surf by data — a dense, sortable table.',
  gallery: 'Surf by sight — an editorial wall of dishes.',
  feed: 'Surf by story — one long, unhurried scroll.',
};

function BrowseToolbar({ mode, setMode, density, setDensity, sort, setSort }) {
  return (
    <div className="ws-toolbar" data-omelette-chrome="">
      <span className="tb-label">View</span>
      <div className="seg" role="tablist">
        {MODES.map((m) => (
          <button key={m.id} role="tab" data-on={mode === m.id ? '1' : '0'}
            onClick={() => setMode(m.id)}>
            <ModeIcon kind={m.id} />{m.label}
          </button>
        ))}
      </div>
      <div className="tb-spacer" />
      <div className="tb-group">
        <span className="tb-label">Density</span>
        <div className="pillset">
          {['cozy', 'compact'].map((d) => (
            <button key={d} data-on={density === d ? '1' : '0'} onClick={() => setDensity(d)}>
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <select className="tb-select" value={sort} onChange={(e) => setSort(e.target.value)}>
        <option value="featured">Sort: Featured</option>
        <option value="az">Sort: A–Z</option>
        <option value="variants">Sort: Most variants</option>
        <option value="region">Sort: Region</option>
      </select>
    </div>
  );
}

// ============================ INDEX ============================
function IndexView({ dishes, sort, setSort }) {
  const cols = [['name', 'Dish'], ['origin', 'Origin'], ['region', 'Region'], ['variants', 'Var.'], ['type', 'Type'], ['updated', 'Updated']];
  const sortMap = { name: 'az', variants: 'variants', region: 'region' };
  return (
    <div className="idx-wrap">
      <div className="idx-head">
        {cols.map(([k, lbl]) => (
          <span key={k} onClick={() => sortMap[k] && setSort(sortMap[k])}>
            {lbl}{sortMap[k] && sort === sortMap[k] ? ' ↓' : ''}
          </span>
        ))}
      </div>
      {dishes.map((d) => (
        <div className="idx-row" key={d.id}>
          <span className="name">{d.name}</span>
          <span className="org">{d.origin}, {d.country}</span>
          <span className="idx-tag">{d.region}</span>
          <span className="idx-count">{d.variants}</span>
          <span className="org mono" style={{ fontSize: 12.5 }}>{d.type}</span>
          <span className="org mono" style={{ fontSize: 12.5 }}>{d.updated} ago</span>
        </div>
      ))}
    </div>
  );
}

// ============================ GALLERY ============================
function GalleryView({ dishes }) {
  return (
    <div className="gal">
      {dishes.map((d) => (
        <article className="gal-card" key={d.id}>
          <Ph label={`dish photo · ${d.name.toLowerCase()}`} h={230} t1={d.t1} t2={d.t2} />
          <h3>{d.name}</h3>
          <div className="place">{d.origin.toUpperCase()} · {d.country.toUpperCase()}</div>
          <p>{d.note}</p>
        </article>
      ))}
    </div>
  );
}

// ============================ FEED ============================
function FeedView({ dishes }) {
  return (
    <div className="feed">
      {dishes.map((d) => (
        <article className="feed-card" key={d.id}>
          <div className="feed-img">
            <Ph label={`hero photo · ${d.name.toLowerCase()}`} h={'100%'} r={0} t1={d.t1} t2={d.t2} style={{ borderRadius: 0, minHeight: 280 }} />
          </div>
          <div className="feed-txt">
            <div className="place">{d.region} · {d.country}</div>
            <h3>{d.name}</h3>
            <p>{d.long}</p>
            <div className="feed-meta">
              <span><b>{d.variants}</b> regional variants</span>
              <span><b>{d.type}</b></span>
              <span>updated {d.updated} ago</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// ============================ ATLAS ============================
function AtlasView({ dishes }) {
  const [active, setActive] = React.useState(null);
  // group by region in REGION_ORDER
  const groups = window.REGION_ORDER
    .map((r) => [r, dishes.filter((d) => d.region === r)])
    .filter(([, arr]) => arr.length);
  const proj = (d) => ({ left: ((d.lon + 180) / 360) * 100, top: ((90 - d.lat) / 180) * 100 });
  return (
    <div className="atl-grid">
      <div className="atl-map">
        <div className="atl-mapbox">
          {dishes.map((d) => {
            const p = proj(d);
            return (
              <div key={d.id} className="atl-pin" data-active={active === d.id ? '1' : '0'}
                style={{ left: p.left + '%', top: p.top + '%' }}
                onMouseEnter={() => setActive(d.id)} onMouseLeave={() => setActive(null)}>
                <i />
                <span>{d.name} · {d.country}</span>
              </div>
            );
          })}
          <span className="ph" style={{ position: 'absolute', inset: 'auto auto 0 0', pointerEvents: 'none' }}></span>
          <div style={{ position: 'absolute', left: 12, bottom: 10, fontFamily: '"IBM Plex Mono",monospace', fontSize: 11, color: 'rgba(33,28,22,0.5)', background: 'rgba(251,248,241,0.82)', padding: '3px 7px', borderRadius: 3 }}>
            map · world food density
          </div>
        </div>
        <div className="atl-maplabel"><span>EQUIRECTANGULAR</span><span>GUSTALE · ATLAS</span><span>{dishes.length} PINS</span></div>
      </div>
      <div className="atl-list">
        {groups.map(([region, arr]) => (
          <React.Fragment key={region}>
            <div className="atl-region-h">{region} · {arr.length}</div>
            {arr.map((d) => (
              <div key={d.id} className="atl-item" data-active={active === d.id ? '1' : '0'}
                onMouseEnter={() => setActive(d.id)} onMouseLeave={() => setActive(null)}>
                <span className="nm">{d.name}</span>
                <span className="co">{d.origin}, {d.country}</span>
                <span className="cd">{d.lat.toFixed(1)}, {d.lon.toFixed(1)}</span>
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { BrowseToolbar, IndexView, GalleryView, FeedView, AtlasView, MODE_BLURB });
