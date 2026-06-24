/* GUSTALE — main app: assembles the page + wires browse modes + Tweaks. */

const { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakSelect, TweakSlider, TweakToggle, TweakColor } = window;

const TONES = {
  cream: { '--bg': '#F6F1E7', '--card': '#FBF8F1' },
  paper: { '--bg': '#F1EBDD', '--card': '#F8F3E8' },
  warm:  { '--bg': '#FAF7F0', '--card': '#FFFFFF' },
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#B8552F",
  "tone": "cream",
  "display": "serif",
  "radius": 6,
  "defaultView": "atlas",
  "defaultDensity": "cozy",
  "showMap": true
}/*EDITMODE-END*/;

function GustaleApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [mode, setMode] = React.useState(t.defaultView);
  const [density, setDensity] = React.useState(t.defaultDensity);
  const [sort, setSort] = React.useState('featured');

  // tweak default -> live preview
  React.useEffect(() => { setMode(t.defaultView); }, [t.defaultView]);
  React.useEffect(() => { setDensity(t.defaultDensity); }, [t.defaultDensity]);

  const { BrowseToolbar, IndexView, GalleryView, FeedView, AtlasView, MODE_BLURB, Placeholder: Ph, DISHES, TRENDING, CRAVINGS, COLLECTIONS } = window;

  const dishes = React.useMemo(() => {
    const arr = [...DISHES];
    if (sort === 'az') arr.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'variants') arr.sort((a, b) => b.variants - a.variants);
    else if (sort === 'region') arr.sort((a, b) => window.REGION_ORDER.indexOf(a.region) - window.REGION_ORDER.indexOf(b.region));
    return arr;
  }, [sort]);

  const rootStyle = {
    ...TONES[t.tone],
    '--accent': t.accent,
    '--accent-ink': '#FBEFE6',
    '--accent-soft': `color-mix(in srgb, ${t.accent} 12%, transparent)`,
    '--radius': t.radius + 'px',
    '--radius-lg': (t.radius + 4) + 'px',
  };

  const View = { atlas: AtlasView, index: IndexView, gallery: GalleryView, feed: FeedView }[mode];

  return (
    <div className={'gst' + (t.display === 'sans' ? ' display-sans' : '')} data-density={density} style={rootStyle}>

      {/* NAV */}
      <nav className="gst-nav">
        <div className="wrap gst-nav-in">
          <div className="gst-wordmark">Gustale</div>
          <div className="gst-navlinks">
            <a href="Gustale Atlas.html">Atlas</a><a href="Gustale Families.html">Families</a><a href="Gustale Dumpling Lineage.html">Lineages</a><a href="Gustale Recipes.html">Recipes</a><a href="Gustale About.html">About</a>
          </div>
          <div className="gst-navr">
            <a className="gst-ghost" href="Gustale Sign In.html">Sign in</a>
            <a className="btn-accent" href="Gustale Contribute.html">Contribute</a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="wrap">
        <div className={'gst-hero' + (t.showMap ? '' : ' no-map')}>
          <div>
            <div className="kicker">A living atlas of world food</div>
            <h1 className="hero-h1">Every dish<br />has a <em>place.</em></h1>
            <p className="hero-lede">Gustale maps the world’s food to where it lives — origins,
              regional names, and the journeys that carried a recipe across borders. Then it lets
              you browse it your way.</p>
            <div className="hero-search">
              <input placeholder="Search a dish, ingredient, or place" />
              <button>→</button>
            </div>
            <div className="hero-meta">
              <span><b>14,283</b>dishes</span>
              <span><b>1,940</b>regions</span>
              <span><b>190</b>countries</span>
            </div>
          </div>
          {t.showMap && (
            <div className="hero-frame">
              <Ph label="map · world food density" h={400} t1="#E6D8BF" t2="#D9C8A8" />
              <div className="hero-coord"><span>LAT 41.90° N</span><span>GUSTALE · ATLAS</span><span>LON 12.50° E</span></div>
            </div>
          )}
        </div>
      </header>

      {/* WAYS IN — wayfinding to the three pillars */}
      <section className="wrap section" style={{ paddingTop: 8, paddingBottom: 30 }}>
        <div className="sec-rule"><h2>Three ways into the atlas</h2><span>PLACE · FORM · PROVENANCE</span></div>
        <div className="trend-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <a className="trend" href="Gustale Atlas.html" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Ph label="map · world food atlas" h={150} r={0} t1="#E6D8BF" t2="#D9C8A8" style={{ borderRadius: 0 }} />
            <div className="body">
              <h3>The Atlas</h3>
              <div className="cc">BY PLACE</div>
              <p>Pan a projected world map and follow dishes to exactly where they live.</p>
            </div>
          </a>
          <a className="trend" href="Gustale Families.html" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Ph label="family · the shapes food takes" h={150} r={0} t1="#E5C277" t2="#D9B15C" style={{ borderRadius: 0 }} />
            <div className="body">
              <h3>Families</h3>
              <div className="cc">BY FORM</div>
              <p>Before a dish has a country it has a form — dumpling, flatbread, egg dish.</p>
            </div>
          </a>
          <a className="trend" href="Gustale Dumpling Lineage.html" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Ph label="lineage · migration routes" h={150} r={0} t1="#E4D2BC" t2="#D6C0A2" style={{ borderRadius: 0 }} />
            <div className="body">
              <h3>Lineages</h3>
              <div className="cc">BY PROVENANCE</div>
              <p>Trace one idea across centuries of borders, names, and contested origins.</p>
            </div>
          </a>
        </div>
      </section>

      {/* BROWSE WORKSPACE — the customizable core */}
      <section className="wrap workspace">
        <div className="ws-head">
          <div>
            <h2>Browse the atlas, your way</h2>
            <p>{MODE_BLURB[mode]}</p>
          </div>
          <div className="ws-count">{dishes.length} of 14,283 dishes</div>
        </div>
        <BrowseToolbar mode={mode} setMode={setMode} density={density} setDensity={setDensity} sort={sort} setSort={setSort} />
        <View dishes={dishes} sort={sort} setSort={setSort} />
      </section>

      {/* DISCOVERY — trending origins */}
      <section className="wrap section">
        <div className="sec-rule"><h2>Trending origins</h2><a href="Gustale Regions.html">All 190 origins →</a></div>
        <div className="trend-row">
          {TRENDING.map((tr) => (
            <article className="trend" key={tr.name}>
              <Ph label={`origin · ${tr.name.toLowerCase()}`} h={180} r={0} t1={tr.t1} t2={tr.t2} style={{ borderRadius: 0 }} />
              <div className="body">
                <h3>{tr.name}</h3>
                <div className="cc">{tr.place.toUpperCase()}</div>
                <p>{tr.note}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* FEATURE — dish of the week */}
      <section className="wrap section" style={{ paddingTop: 0 }}>
        <div className="feature">
          <div className="txt">
            <div className="tag">Dish of the week</div>
            <h2>Trace the dumpling across the world.</h2>
            <p>A pocket of dough around a filling appears on nearly every continent — shaped by
              climate, trade, and migration. Gustale connects them as a single family, so you can
              follow one idea told in a hundred kitchens.</p>
            <a className="btn-outline" href="Gustale Dumpling Lineage.html" style={{ textDecoration: 'none' }}>Open the full story</a>
          </div>
          <Ph label="hero photo · dumpling family" h={400} r={0} t1="#E4D2BC" t2="#D6C0A2" style={{ borderRadius: 0 }} />
        </div>
      </section>

      {/* CRAVINGS */}
      <section className="wrap section" style={{ paddingTop: 0 }}>
        <div className="sec-rule"><h2>Browse by craving</h2><span>10 tags</span></div>
        <div className="cravings">
          {CRAVINGS.map((c) => <button className="crav" key={c}>{c}</button>)}
        </div>
      </section>

      {/* SCHEMA — structured database */}
      <section className="wrap section" style={{ paddingTop: 0 }}>
        <div className="sec-rule"><h2>Browse the schema</h2><a href="Gustale Data.html">Open the API →</a></div>
        <div className="schema">
          {COLLECTIONS.map((c) => (
            <div className="schema-card" key={c[0]}>
              <div className="num">{c[1]}</div>
              <div className="nm">{c[0]}</div>
              <div className="ds">{c[2]}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CONTRIBUTE */}
      <section className="wrap section" style={{ paddingTop: 0 }}>
        <div className="band">
          <div>
            <h2>Food is collective memory.</h2>
            <p>Gustale is built by cooks, writers, and travelers documenting the dishes they know
              best. Add a recipe, correct a name, or map a missing region.</p>
          </div>
          <div className="band-cta">
            <a href="Gustale Contribute.html" style={{ background: 'var(--accent-ink)', color: 'var(--accent)', border: 'none', fontFamily: 'inherit', fontSize: 16, fontWeight: 600, padding: '15px 30px', borderRadius: 999, cursor: 'pointer', textDecoration: 'none' }}>Become a contributor</a>
            <small>3,100+ contributors · 62 languages</small>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="wrap gst-foot">
        <div>
          <div className="fm">Gustale</div>
          <div className="fcap">gustale.com · gustale.recipes</div>
        </div>
        <div className="fl">
          <a href="Gustale Atlas.html">Atlas</a><a href="Gustale Families.html">Families</a><a href="Gustale Dumpling Lineage.html">Lineages</a><a href="Gustale Recipes.html">Recipes</a><a href="Gustale Regions.html">Regions</a><a href="Gustale Data.html">Data</a><a href="Gustale About.html">About</a>
        </div>
      </footer>

      {/* TWEAKS */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Browsing defaults" />
        <TweakSelect label="Default view" value={t.defaultView}
          options={[{ value: 'atlas', label: 'Atlas — by place' }, { value: 'index', label: 'Index — by data' }, { value: 'gallery', label: 'Gallery — by sight' }, { value: 'feed', label: 'Feed — by story' }]}
          onChange={(v) => setTweak('defaultView', v)} />
        <TweakRadio label="Default density" value={t.defaultDensity} options={['cozy', 'compact']}
          onChange={(v) => setTweak('defaultDensity', v)} />

        <TweakSection label="Identity" />
        <TweakColor label="Accent" value={t.accent}
          options={['#B8552F', '#9E4A4A', '#5E6B3A', '#2C2A24']}
          onChange={(v) => setTweak('accent', v)} />
        <TweakRadio label="Background" value={t.tone} options={[{ value: 'cream', label: 'Cream' }, { value: 'paper', label: 'Paper' }, { value: 'warm', label: 'Warm' }]}
          onChange={(v) => setTweak('tone', v)} />
        <TweakRadio label="Display type" value={t.display} options={[{ value: 'serif', label: 'Serif' }, { value: 'sans', label: 'Sans' }]}
          onChange={(v) => setTweak('display', v)} />
        <TweakSlider label="Corner radius" value={t.radius} min={0} max={16} unit="px"
          onChange={(v) => setTweak('radius', v)} />

        <TweakSection label="Layout" />
        <TweakToggle label="Hero map" value={t.showMap} onChange={(v) => setTweak('showMap', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<GustaleApp />);
