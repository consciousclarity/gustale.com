import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';









/* GUSTALE — Atlas explorer data.
   Dishes geolocated for the world map; continent outlines stored as [lon,lat]
   arrays and projected at render time so pins and landmasses share one projection. */

// dish(name, country, lat, lon, region, family, zone, blurb, recipe?)
const a = (name, country, lat, lon, region, family, zone, blurb, recipe) =>
  ({ name, country, lat, lon, region, family, zone, blurb, recipe: !!recipe });

const ATLAS_DISHES = [
  a('Shakshuka', 'Tunisia', 36.8, 10.2, 'North Africa', 'Egg dishes', 'Africa', 'Eggs poached in a harissa-spiked pepper and tomato sauce.', true),
  a('Menemen', 'Türkiye', 38.4, 27.1, 'Anatolia', 'Egg dishes', 'West Asia', 'A soft scramble of egg, green pepper, and tomato.'),
  a('Huevos Rancheros', 'Mexico', 19.4, -99.1, 'Mesoamerica', 'Egg dishes', 'Americas', 'Fried eggs on tortillas, flooded with warm salsa.'),
  a('Gyōza', 'Japan', 35.7, 139.7, 'East Asia', 'Dumplings', 'East Asia', 'Pan-fried crescents, crisp on one side, juicy within.'),
  a('Pierogi', 'Poland', 50.0, 19.9, 'Central Europe', 'Dumplings', 'Europe', 'Half-moons of dough around potato, cheese, or fruit.'),
  a('Khinkali', 'Georgia', 41.7, 44.8, 'Caucasus', 'Dumplings', 'West Asia', 'Twisted soup dumplings, eaten by hand from the knot.'),
  a('Momo', 'Nepal', 27.7, 85.3, 'South Asia', 'Dumplings', 'South Asia', 'Himalayan steamed parcels with a fiery tomato achar.'),
  a('Phở', 'Vietnam', 21.0, 105.8, 'Mainland SE Asia', 'Noodle soups', 'SE Asia', 'Clear beef broth, rice noodles, a fistful of herbs.'),
  a('Ramen', 'Japan', 35.0, 135.5, 'East Asia', 'Noodle soups', 'East Asia', 'Wheat noodles in a long-simmered, savory broth.'),
  a('Laksa', 'Malaysia', 3.1, 101.7, 'Maritime SE Asia', 'Noodle soups', 'SE Asia', 'Noodles in a coconut-and-spice curry broth.'),
  a('Bibimbap', 'Korea', 35.8, 127.1, 'East Asia', 'Rice bowls', 'East Asia', 'Rice crowned with seasoned vegetables and gochujang.'),
  a('Jollof Rice', 'Nigeria', 6.5, 3.4, 'West Africa', 'Rice bowls', 'Africa', 'One-pot rice simmered in a smoky pepper-tomato base.'),
  a('Tagine', 'Morocco', 31.6, -8.0, 'Maghreb', 'Stews & braises', 'Africa', 'Slow-steamed in a conical pot with fruit and spice.'),
  a('Feijoada', 'Brazil', -22.9, -43.2, 'South America', 'Stews & braises', 'Americas', 'A deep black-bean stew of smoked and salted meats.'),
  a('Goulash', 'Hungary', 47.5, 19.0, 'Central Europe', 'Stews & braises', 'Europe', 'Paprika-rich beef stew, born of the herdsmen’s kettle.'),
  a('Yakitori', 'Japan', 34.7, 135.5, 'East Asia', 'Grilled & skewered', 'East Asia', 'Charcoal-grilled chicken skewers, glazed or salted.'),
  a('Souvlaki', 'Greece', 38.0, 23.7, 'Balkans', 'Grilled & skewered', 'Europe', 'Skewered, fire-grilled meat with lemon and oregano.'),
  a('Satay', 'Indonesia', -6.2, 106.8, 'Maritime SE Asia', 'Grilled & skewered', 'SE Asia', 'Marinated skewers with a rich peanut sauce.'),
  a('Naan', 'India', 28.6, 77.2, 'South Asia', 'Flatbreads', 'South Asia', 'Leavened flatbread blistered against a tandoor wall.'),
  a('Injera', 'Ethiopia', 9.0, 38.7, 'East Africa', 'Flatbreads', 'Africa', 'A spongy, fermented teff bread that is also the plate.'),
  a('Empanada', 'Argentina', -34.6, -58.4, 'South America', 'Filled breads', 'Americas', 'Baked or fried pastry folded around a savory filling.'),
  a('Bao', 'China', 31.2, 121.5, 'East Asia', 'Filled breads', 'East Asia', 'Pillowy steamed buns around pork, bean, or greens.'),
  a('Kimchi', 'Korea', 37.6, 127.0, 'East Asia', 'Pickles & ferments', 'East Asia', 'Napa cabbage fermented with chili, garlic, and brine.'),
  a('Sauerkraut', 'Germany', 52.5, 13.4, 'Central Europe', 'Pickles & ferments', 'Europe', 'Shredded cabbage soured slowly under its own brine.'),
  a('Flan', 'Mexico', 21.2, -89.6, 'Mesoamerica', 'Custards & puddings', 'Americas', 'A baked caramel custard, silk-smooth and amber-topped.'),
  a('Panna Cotta', 'Italy', 45.1, 7.7, 'Southern Europe', 'Custards & puddings', 'Europe', 'Sweet cream set just barely with a whisper of gelatin.'),
  a('Churros', 'Spain', 40.4, -3.7, 'Iberia', 'Fried sweets', 'Europe', 'Ridged dough fried crisp, rolled in cinnamon sugar.'),
  a('Jalebi', 'India', 26.9, 75.8, 'South Asia', 'Fried sweets', 'South Asia', 'Batter spiralled into hot oil, then soaked in syrup.'),
  a('Borscht', 'Ukraine', 50.5, 30.5, 'Eastern Europe', 'Soups & broths', 'Europe', 'A beetroot soup, deep magenta, sharp and warming.'),
  a('Tom Yum', 'Thailand', 13.7, 100.5, 'Mainland SE Asia', 'Soups & broths', 'SE Asia', 'Hot-and-sour broth of lemongrass, lime, and chili.'),
];

// color encodings
const FAMILY_COLORS = {
  'Egg dishes': '#C2742F', 'Dumplings': '#C99A48', 'Noodle soups': '#B5523B',
  'Rice bowls': '#CDA552', 'Stews & braises': '#9A4B2C', 'Grilled & skewered': '#B07636',
  'Flatbreads': '#CBB173', 'Filled breads': '#C08A45', 'Pickles & ferments': '#7E8A4A',
  'Custards & puddings': '#D7B45E', 'Fried sweets': '#CE8A3C', 'Soups & broths': '#A85436',
};
const ZONE_COLORS = {
  'Africa': '#C2742F', 'Europe': '#6E7F4E', 'West Asia': '#A8503A',
  'South Asia': '#C99A48', 'East Asia': '#B14A3A', 'SE Asia': '#4F8A72', 'Americas': '#3F7C8C',
};

// simplified continent outlines as [lon,lat] rings (stylized, recognizable)
const CONTINENTS = [
  { name: 'North America', ring: [[-168,65],[-150,61],[-130,57],[-125,49],[-123,40],[-117,33],[-110,24],[-100,18],[-90,18],[-83,23],[-81,28],[-76,35],[-70,43],[-60,47],[-55,52],[-64,60],[-78,62],[-95,68],[-120,69],[-140,70],[-160,71]] },
  { name: 'Greenland', ring: [[-45,60],[-30,68],[-20,70],[-22,76],[-40,80],[-58,78],[-52,68],[-45,60]] },
  { name: 'South America', ring: [[-81,3],[-78,-5],[-75,-15],[-71,-25],[-70,-35],[-73,-45],[-74,-52],[-66,-55],[-62,-50],[-58,-40],[-57,-32],[-48,-25],[-40,-20],[-35,-8],[-44,-2],[-50,2],[-60,6],[-70,10],[-77,8]] },
  { name: 'Africa', ring: [[-17,15],[-16,21],[-10,30],[0,35],[10,37],[20,33],[32,31],[35,24],[43,12],[51,12],[42,-2],[40,-12],[35,-22],[28,-33],[20,-35],[16,-28],[12,-17],[9,-1],[5,5],[-5,5],[-12,8]] },
  { name: 'Europe', ring: [[-10,37],[-9,43],[-2,48],[-5,53],[2,58],[8,63],[15,66],[25,66],[30,60],[40,58],[40,50],[30,46],[28,41],[20,40],[14,40],[10,44],[3,43],[-3,40]] },
  { name: 'Asia', ring: [[30,60],[40,66],[60,70],[80,72],[100,73],[120,72],[140,70],[160,68],[170,66],[160,60],[145,57],[140,50],[135,43],[127,38],[122,31],[120,24],[110,21],[105,12],[98,8],[95,16],[88,22],[82,8],[77,8],[73,18],[68,24],[60,25],[56,27],[48,30],[45,38],[40,42],[36,45],[32,52]] },
  { name: 'Australia', ring: [[114,-22],[122,-18],[130,-12],[137,-12],[142,-11],[146,-18],[150,-25],[153,-30],[150,-37],[143,-39],[135,-35],[129,-32],[120,-34],[115,-30],[113,-26]] },
];

// small island blobs as [lon,lat,rxDeg,ryDeg]
const ISLANDS = [
  [138.5, 37, 3.2, 6], [140.5, 41.5, 2.6, 4],   // Japan
  [-3, 54, 3, 4.5],                             // UK & Ireland
  [47, -19, 3, 6],                              // Madagascar
  [110, -2, 14, 4],                             // Indonesia spread
  [173, -41, 2.6, 5],                           // New Zealand
  [125, 9, 3, 5],                               // Philippines
  [-79, 22, 4, 2.4],                            // Cuba
];

if (typeof window !== 'undefined') Object.assign(window, { ATLAS_DISHES, FAMILY_COLORS, ZONE_COLORS, CONTINENTS, ISLANDS });


/* GUSTALE — Atlas explorer app: projected world map, pins, filters, detail. */



const ATLAS_TONES = {
  cream: { '--bg': '#F6F1E7', '--card': '#FBF8F1' },
  paper: { '--bg': '#F1EBDD', '--card': '#F8F3E8' },
  warm:  { '--bg': '#FAF7F0', '--card': '#FFFFFF' },
};

const ATLAS_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#B8552F",
  "tone": "cream",
  "display": "serif",
  "mapTone": "parchment",
  "colorBy": "family",
  "graticule": true
}/*EDITMODE-END*/;

// shared equirectangular projection
const SVG_W = 1000, SVG_H = 500;
const sx = (lon) => ((lon + 180) / 360) * SVG_W;
const sy = (lat) => ((90 - lat) / 180) * SVG_H;
const px = (lon) => ((lon + 180) / 360) * 100;
const py = (lat) => ((90 - lat) / 180) * 100;

function WorldMap({ tone, graticule, colorOf, dishes, activeKeys, selected, onSelect, dishKey }) {
  
  const grat = [];
  if (graticule) {
    for (let lon = -150; lon <= 150; lon += 30) grat.push(<line key={'v' + lon} x1={sx(lon)} y1={0} x2={sx(lon)} y2={SVG_H} stroke="var(--mapline)" strokeWidth="1" />);
    for (let lat = -60; lat <= 60; lat += 30) grat.push(<line key={'h' + lat} x1={0} y1={sy(lat)} x2={SVG_W} y2={sy(lat)} stroke="var(--mapline)" strokeWidth="1" />);
  }
  return (
    <div className="map-box" data-tone={tone}>
      <svg className="map-svg" viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="none">
        <rect x="0" y="0" width={SVG_W} height={SVG_H} fill="var(--water)" />
        {grat}
        {CONTINENTS.map((c) => (
          <path key={c.name} d={c.ring.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join(' ') + ' Z'}
            fill="var(--land)" stroke="var(--landstroke)" strokeWidth="1" strokeLinejoin="round" />
        ))}
        {ISLANDS.map((is, i) => (
          <ellipse key={i} cx={sx(is[0])} cy={sy(is[1])} rx={(is[2] / 360) * SVG_W} ry={(is[3] / 180) * SVG_H}
            fill="var(--land)" stroke="var(--landstroke)" strokeWidth="1" />
        ))}
      </svg>
      {dishes.map((dish) => {
        const k = dishKey(dish);
        const on = activeKeys.has(k);
        const sel = selected === k;
        return (
          <div key={k} className="pin" data-sel={sel ? '1' : '0'} data-dim={on ? '0' : '1'}
            style={{ left: px(dish.lon) + '%', top: py(dish.lat) + '%' }}
            onClick={() => onSelect(k)}>
            <div className="ring" style={{ background: colorOf(dish) }} />
            <div className="tip">{dish.name} · {dish.country}</div>
          </div>
        );
      })}
      <div className="map-caption">Equirectangular · {dishes.length} dishes pinned</div>
    </div>
  );
}

function AtlasApp() {
  const [t, setTweak] = useTweaks(ATLAS_TWEAK_DEFAULTS);
  

  const dishKey = (d) => d.name;
  const [selected, setSelected] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [famFilter, setFamFilter] = React.useState('all');
  const [legendOff, setLegendOff] = React.useState(() => new Set()); // hidden color-categories

  const colorBy = t.colorBy; // 'family' | 'zone'
  const palette = colorBy === 'family' ? FAMILY_COLORS : ZONE_COLORS;
  const catOf = (d) => (colorBy === 'family' ? d.family : d.zone);
  const colorOf = (d) => palette[catOf(d)] || '#B8552F';

  const families = React.useMemo(() => {
    const counts = {};
    ATLAS_DISHES.forEach((d) => { counts[d.family] = (counts[d.family] || 0) + 1; });
    return Object.keys(counts).sort().map((f) => ({ id: f, count: counts[f] }));
  }, [ATLAS_DISHES]);

  // categories present for legend
  const categories = React.useMemo(() => {
    const set = new Set(ATLAS_DISHES.map(catOf));
    return [...set].sort();
  }, [colorBy, ATLAS_DISHES]);

  const matches = (d) => {
    if (famFilter !== 'all' && d.family !== famFilter) return false;
    if (legendOff.has(catOf(d))) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!(`${d.name} ${d.country} ${d.region} ${d.family}`.toLowerCase().includes(q))) return false;
    }
    return true;
  };

  const activeKeys = React.useMemo(() => {
    const s = new Set();
    ATLAS_DISHES.forEach((d) => { if (matches(d)) s.add(dishKey(d)); });
    return s;
  }, [famFilter, legendOff, query, colorBy, ATLAS_DISHES]);

  const listDishes = React.useMemo(
    () => ATLAS_DISHES.filter((d) => activeKeys.has(dishKey(d))).sort((a, b) => a.name.localeCompare(b.name)),
    [activeKeys, ATLAS_DISHES]);

  const selDish = ATLAS_DISHES.find((d) => dishKey(d) === selected) || null;

  const toggleLegend = (cat) => setLegendOff((prev) => {
    const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n;
  });

  const rootStyle = {
    ...ATLAS_TONES[t.tone],
    '--accent': t.accent, '--accent-ink': '#FBEFE6',
    '--accent-soft': `color-mix(in srgb, ${t.accent} 12%, transparent)`,
  };

  const familyLink = (fam) => fam === 'Egg dishes' ? 'Gustale Egg Dishes.html' : 'Gustale Families.html';

  return (
    <div className={'gst' + (t.display === 'sans' ? ' display-sans' : '')} style={rootStyle}>

      {/* NAV */}
      <nav className="gst-nav">
        <div className="wrap gst-nav-in">
          <a className="gst-brand" href="Gustale Homepage.html">
            <span className="gst-wordmark">Gustale</span>
            <span className="sub">Atlas</span>
          </a>
          <div className="gst-navlinks">
            <a href="#" data-on="1">Map</a>
            <a href="Gustale Families.html">Families</a>
            <a href="Gustale Homepage.html">Dishes</a>
            <a href="#">Data</a>
          </div>
          <div className="gst-navr">
            <a className="gst-ghost" href="#">Sign in</a>
            <button className="btn-accent">Contribute</button>
          </div>
        </div>
      </nav>

      <main className="wrap">
        {/* HEADER STRIP */}
        <div className="atlas-top">
          <div>
            <div className="atlas-eyebrow">gustale.com · world food atlas</div>
            <h1 className="atlas-title">Where every<br />dish <em>lives.</em></h1>
          </div>
          <div className="right">
            <div className="atlas-stats">
              <div className="s"><b>{ATLAS_DISHES.length}</b><span>Pinned</span></div>
              <div className="s"><b>{families.length}</b><span>Families</span></div>
              <div className="s"><b>{categories.length}</b><span>{colorBy === 'family' ? 'Colors' : 'Zones'}</span></div>
            </div>
            <div className="atlas-search">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="7" r="5" /><path d="M14 14l-3-3" strokeLinecap="round" /></svg>
              <input placeholder="Search dishes, places…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
        </div>

        {/* LAYOUT */}
        <div className="atlas-layout">
          {/* SIDEBAR */}
          <aside className="atlas-side">
            <div className="side-block">
              <div className="sb-h">Filter by family</div>
              <div className="fam-filter">
                <button className="ff-chip" data-on={famFilter === 'all' ? '1' : '0'} onClick={() => setFamFilter('all')}>
                  All<span className="ct">{ATLAS_DISHES.length}</span>
                </button>
                {families.map((f) => (
                  <button key={f.id} className="ff-chip" data-on={famFilter === f.id ? '1' : '0'} onClick={() => setFamFilter(famFilter === f.id ? 'all' : f.id)}>
                    <span className="dot" style={{ background: (colorBy === 'family' ? FAMILY_COLORS[f.id] : 'var(--accent)') }} />
                    {f.id}<span className="ct">{f.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="side-block">
              <div className="sb-h">{listDishes.length} {listDishes.length === 1 ? 'dish' : 'dishes'} shown</div>
              <div className="dish-list">
                {listDishes.length === 0 && <div className="dl-empty">No dishes match these filters.</div>}
                {listDishes.map((d) => (
                  <div key={dishKey(d)} className="dl-row" data-on={selected === dishKey(d) ? '1' : '0'} onClick={() => setSelected(dishKey(d))}>
                    <span className="dot" style={{ background: colorOf(d) }} />
                    <span className="meta">
                      <span className="nm">{d.name}</span>
                      <span className="co">{d.country} · {d.lat.toFixed(1)}, {d.lon.toFixed(1)}</span>
                    </span>
                    {d.recipe && <span className="rec">Recipe</span>}
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* MAP */}
          <div className="atlas-mapwrap">
            <WorldMap
              tone={t.mapTone} graticule={t.graticule} colorOf={colorOf}
              dishes={ATLAS_DISHES} activeKeys={activeKeys} selected={selected}
              onSelect={setSelected} dishKey={dishKey} />

            {/* legend */}
            <div className="map-legend">
              {categories.map((cat) => (
                <span key={cat} className="lg-item" data-on={legendOff.has(cat) ? '0' : '1'} onClick={() => toggleLegend(cat)}>
                  <span className="sw" style={{ background: palette[cat] }} />{cat}
                </span>
              ))}
            </div>

            {/* detail card */}
            {selDish ? (
              <div className="detail">
                <div>
                  <div className="d-top">
                    <span className="d-dot" style={{ background: colorOf(selDish) }} />
                    <h3>{selDish.name}</h3>
                  </div>
                  <div className="d-sub">{selDish.country.toUpperCase()} · {selDish.region.toUpperCase()} · {selDish.family.toUpperCase()}</div>
                  <p>{selDish.blurb}</p>
                </div>
                <div className="d-side">
                  <span className="d-coord">◇ {selDish.lat.toFixed(2)}, {selDish.lon.toFixed(2)}</span>
                  {selDish.recipe
                    ? <a className="d-btn primary" href="Gustale Recipes.html">View recipe →</a>
                    : <span className="d-btn disabled">Recipe in progress</span>}
                  <a className="d-btn ghost" href={familyLink(selDish.family)}>Open {selDish.family} →</a>
                </div>
              </div>
            ) : (
              <div className="detail empty">
                <span className="d-hint">◎ Select a pin or a dish from the list to see where it lives and open its recipe.</span>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <footer className="gst-foot">
          <div>
            <div className="fm">Gustale <span style={{ color: 'var(--accent)' }}>Atlas</span></div>
            <div className="fcap">gustale.com · gustale.recipes</div>
          </div>
          <div className="fl">
            <a href="Gustale Homepage.html">Home</a><a href="Gustale Families.html">Families</a><a href="#">API</a><a href="#">About</a>
          </div>
        </footer>
      </main>

      {/* TWEAKS */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Map" />
        <TweakRadio label="Map tone" value={t.mapTone} options={[{ value: 'parchment', label: 'Parchment' }, { value: 'sea', label: 'Sea' }, { value: 'night', label: 'Night' }]} onChange={(v) => setTweak('mapTone', v)} />
        <TweakRadio label="Colour pins by" value={t.colorBy} options={[{ value: 'family', label: 'Family' }, { value: 'zone', label: 'Zone' }]} onChange={(v) => { setLegendOff(new Set()); setTweak('colorBy', v); }} />
        <TweakToggle label="Graticule grid" value={t.graticule} onChange={(v) => setTweak('graticule', v)} />

        <TweakSection label="Identity" />
        <TweakColor label="Accent" value={t.accent} options={['#B8552F', '#9E4A4A', '#5E6B3A', '#2C2A24']} onChange={(v) => setTweak('accent', v)} />
        <TweakRadio label="Background" value={t.tone} options={[{ value: 'cream', label: 'Cream' }, { value: 'paper', label: 'Paper' }, { value: 'warm', label: 'Warm' }]} onChange={(v) => setTweak('tone', v)} />
        <TweakRadio label="Display type" value={t.display} options={[{ value: 'serif', label: 'Serif' }, { value: 'sans', label: 'Sans' }]} onChange={(v) => setTweak('display', v)} />
      </TweaksPanel>
    </div>
  );
}




// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
// Exports (to window): useTweaks, TweaksPanel, TweakSection, TweakRow, TweakSlider,
//   TweakToggle, TweakRadio, TweakSelect, TweakText, TweakNumber, TweakColor, TweakButton.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// TweakRadio is the segmented control for 2–3 short options (auto-falls-back to
// TweakSelect past ~16/~10 chars per label); reach for TweakSelect directly when
// options are many or long. For color tweaks always curate 3-4 options rather than
// a free picker; an option can also be a whole 2–5 color palette (the stored value
// is the array). The Tweak* controls are a floor, not a ceiling — build custom
// controls inside the panel if a tweak calls for UI they don't cover.
/* END USAGE */
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s cubic-bezier(.3,.7,.4,1),box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),
    0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 rgba(0,0,0,.1)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => ({ ...prev, ...edits }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent('tweakchange', { detail: edits }));
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({ title = 'Tweaks', children }) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({ x: 16, y: 16 });
  const PAD = 16;

  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);

  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);

  React.useEffect(() => {
    const onMsg = (e) => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);
      else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
  };

  const onDragStart = (e) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  if (!open) return null;
  return (
    <>
      <style>{__TWEAKS_STYLE}</style>
      <div ref={dragRef} className="twk-panel" data-omelette-chrome=""
           style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
        <div className="twk-hd" onMouseDown={onDragStart}>
          <b>{title}</b>
          <button className="twk-x" aria-label="Close tweaks"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={dismiss}>✕</button>
        </div>
        <div className="twk-body">
          {children}
        </div>
      </div>
    </>
  );
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({ label, children }) {
  return (
    <>
      <div className="twk-sect">{label}</div>
      {children}
    </>
  );
}

function TweakRow({ label, value, children, inline = false }) {
  return (
    <div className={inline ? 'twk-row twk-row-h' : 'twk-row'}>
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span className="twk-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({ label, value, min = 0, max = 100, step = 1, unit = '', onChange }) {
  return (
    <TweakRow label={label} value={`${value}${unit}`}>
      <input type="range" className="twk-slider" min={min} max={max} step={step}
             value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </TweakRow>
  );
}

function TweakToggle({ label, value, onChange }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button type="button" className="twk-toggle" data-on={value ? '1' : '0'}
              role="switch" aria-checked={!!value}
              onClick={() => onChange(!value)}><i /></button>
    </div>
  );
}

function TweakRadio({ label, value, options, onChange }) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = (o) => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({ 2: 16, 3: 10 }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = (s) => {
      const m = options.find((o) => String(typeof o === 'object' ? o.value : o) === s);
      return m === undefined ? s : typeof m === 'object' ? m.value : m;
    };
    return <TweakSelect label={label} value={value} options={options}
                        onChange={(s) => onChange(resolve(s))} />;
  }
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const idx = Math.max(0, opts.findIndex((o) => o.value === value));
  const n = opts.length;

  const segAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor(((clientX - r.left - 2) / inner) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };

  const onPointerDown = (e) => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = (ev) => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <TweakRow label={label}>
      <div ref={trackRef} role="radiogroup" onPointerDown={onPointerDown}
           className={dragging ? 'twk-seg dragging' : 'twk-seg'}>
        <div className="twk-seg-thumb"
             style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
                      width: `calc((100% - 4px) / ${n})` }} />
        {opts.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}>
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}

function TweakSelect({ label, value, options, onChange }) {
  return (
    <TweakRow label={label}>
      <select className="twk-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </TweakRow>
  );
}

function TweakText({ label, value, placeholder, onChange }) {
  return (
    <TweakRow label={label}>
      <input className="twk-field" type="text" value={value} placeholder={placeholder}
             onChange={(e) => onChange(e.target.value)} />
    </TweakRow>
  );
}

function TweakNumber({ label, value, min, max, step = 1, unit = '', onChange }) {
  const clamp = (n) => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({ x: 0, val: 0 });
  const onScrubStart = (e) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, val: value };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = (ev) => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="twk-num">
      <span className="twk-num-lbl" onPointerDown={onScrubStart}>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step}
             onChange={(e) => onChange(clamp(Number(e.target.value)))} />
      {unit && <span className="twk-num-unit">{unit}</span>}
    </div>
  );
}

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}

const __TwkCheck = ({ light }) => (
  <svg viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7.2 5.8 10 11 4.2" fill="none" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
          stroke={light ? 'rgba(0,0,0,.78)' : '#fff'} />
  </svg>
);

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({ label, value, options, onChange }) {
  if (!options || !options.length) {
    return (
      <div className="twk-row twk-row-h">
        <div className="twk-lbl"><span>{label}</span></div>
        <input type="color" className="twk-swatch" value={value}
               onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = (o) => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return (
    <TweakRow label={label}>
      <div className="twk-chips" role="radiogroup">
        {options.map((o, i) => {
          const colors = Array.isArray(o) ? o : [o];
          const [hero, ...rest] = colors;
          const sup = rest.slice(0, 4);
          const on = key(o) === cur;
          return (
            <button key={i} type="button" className="twk-chip" role="radio"
                    aria-checked={on} data-on={on ? '1' : '0'}
                    aria-label={colors.join(', ')} title={colors.join(' · ')}
                    style={{ background: hero }}
                    onClick={() => onChange(o)}>
              {sup.length > 0 && (
                <span>
                  {sup.map((c, j) => <i key={j} style={{ background: c }} />)}
                </span>
              )}
              {on && <__TwkCheck light={__twkIsLight(hero)} />}
            </button>
          );
        })}
      </div>
    </TweakRow>
  );
}

function TweakButton({ label, onClick, secondary = false }) {
  return (
    <button type="button" className={secondary ? 'twk-btn secondary' : 'twk-btn'}
            onClick={onClick}>{label}</button>
  );
}

if (typeof window !== 'undefined') Object.assign(window, {
  useTweaks, TweaksPanel, TweakSection, TweakRow,
  TweakSlider, TweakToggle, TweakRadio, TweakSelect,
  TweakText, TweakNumber, TweakColor, TweakButton,
});

export default AtlasApp;
