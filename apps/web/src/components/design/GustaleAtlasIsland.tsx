import { useState, useMemo, useCallback } from 'react';
import '../../styles/atlas-island.css';

// ============================================================================
// Data constants (extracted from deployed JS)
// ============================================================================

export interface Dish {
  name: string;
  country: string;
  lat: number;
  lon: number;
  region: string;
  family: string;
  zone: string;
  blurb: string;
  recipe: boolean;
}

export const ATLAS_DISHES: Dish[] = [
  { name: "Shakshuka", country: "Tunisia", lat: 33.89, lon: 9.56, region: "North Africa", family: "Egg dishes", zone: "Africa", blurb: "Eggs poached in spiced tomato sauce", recipe: true },
  { name: "Carbonara", country: "Italy", lat: 41.87, lon: 12.57, region: "Southern Europe", family: "Pasta", zone: "Europe", blurb: "Pasta with egg, cheese, guanciale", recipe: true },
  { name: "Pho", country: "Vietnam", lat: 21.03, lon: 105.85, region: "Southeast Asia", family: "Noodle soups", zone: "Asia", blurb: "Vietnamese beef noodle soup", recipe: true },
  { name: "Tacos al Pastor", country: "Mexico", lat: 19.43, lon: -99.13, region: "North America", family: "Street foods", zone: "Americas", blurb: "Marinated pork tacos", recipe: true },
  { name: "Sushi", country: "Japan", lat: 35.68, lon: 139.69, region: "East Asia", family: "Seafood", zone: "Asia", blurb: "Vinegared rice with raw fish", recipe: true },
  { name: "Butter Chicken", country: "India", lat: 28.61, lon: 77.21, region: "South Asia", family: "Curries", zone: "Asia", blurb: "Murgh makhani in tomato butter sauce", recipe: true },
  { name: "Paella", country: "Spain", lat: 39.47, lon: -0.38, region: "Southern Europe", family: "Rice dishes", zone: "Europe", blurb: "Saffron rice with seafood", recipe: true },
  { name: "Borscht", country: "Ukraine", lat: 50.45, lon: 30.52, region: "Eastern Europe", family: "Soups", zone: "Europe", blurb: "Beet soup with beef", recipe: true },
  { name: "Kimchi", country: "South Korea", lat: 37.57, lon: 126.98, region: "East Asia", family: "Fermented foods", zone: "Asia", blurb: "Spicy fermented vegetables", recipe: true },
  { name: "Moussaka", country: "Greece", lat: 37.98, lon: 23.73, region: "Southern Europe", family: "Cassroles", zone: "Europe", blurb: "Layered eggplant with meat", recipe: true },
  { name: "Jollof Rice", country: "Nigeria", lat: 9.06, lon: 7.49, region: "West Africa", family: "Rice dishes", zone: "Africa", blurb: "Tomato rice with peppers", recipe: true },
  { name: "Ramen", country: "Japan", lat: 35.68, lon: 139.69, region: "East Asia", family: "Noodle soups", zone: "Asia", blurb: "wheat noodles in rich broth", recipe: true },
  { name: "Feijoada", country: "Brazil", lat: -15.78, lon: -47.93, region: "South America", family: "Stews", zone: "Americas", blurb: "Black bean and pork stew", recipe: true },
  { name: "Pierogi", country: "Poland", lat: 52.23, lon: 21.01, region: "Eastern Europe", family: "Dumplings", zone: "Europe", blurb: "Stuffed pasta with various fillings", recipe: true },
  { name: "Couscous", country: "Morocco", lat: 31.79, lon: -7.08, region: "North Africa", family: "Grains", zone: "Africa", blurb: "Steamed semolina granules", recipe: true },
  { name: "Pad Thai", country: "Thailand", lat: 13.75, lon: 100.52, region: "Southeast Asia", family: "Noodles", zone: "Asia", blurb: "Stir-fried rice noodles with tamarind", recipe: true },
  { name: "Bouillabaisse", country: "France", lat: 43.30, lon: 5.37, region: "Western Europe", family: "Soups", zone: "Europe", blurb: "Provençal fish stew", recipe: true },
  { name: "Goulash", country: "Hungary", lat: 47.50, lon: 19.04, region: "Eastern Europe", family: "Stews", zone: "Europe", blurb: "Paprika beef stew", recipe: true },
  { name: "Ceviche", country: "Peru", lat: -12.05, lon: -77.04, region: "South America", family: "Seafood", zone: "Americas", blurb: "Citrus-cured raw fish", recipe: true },
  { name: "Pho Bo", country: "Vietnam", lat: 21.03, lon: 105.85, region: "Southeast Asia", family: "Noodle soups", zone: "Asia", blurb: "Beef pho with herbs", recipe: true },
  { name: "Lasagna", country: "Italy", lat: 44.49, lon: 11.35, region: "Southern Europe", family: "Pasta", zone: "Europe", blurb: "Layered pasta with ragù and béchamel", recipe: true },
  { name: "Kebab", country: "Turkey", lat: 39.93, lon: 32.86, region: "Middle East", family: "Street foods", zone: "Europe", blurb: "Grilled minced meat on skewers", recipe: true },
  { name: "Tagine", country: "Morocco", lat: 31.63, lon: -7.99, region: "North Africa", family: "Stews", zone: "Africa", blurb: "Slow-cooked spiced meat and vegetables", recipe: true },
  { name: "Ravioli", country: "Italy", lat: 45.46, lon: 9.19, region: "Southern Europe", family: "Pasta", zone: "Europe", blurb: "Stuffed pasta pockets", recipe: true },
  { name: "Gyoza", country: "Japan", lat: 35.68, lon: 139.69, region: "East Asia", family: "Dumplings", zone: "Asia", blurb: "Pan-fried dumplings", recipe: true },
  { name: "Biryani", country: "India", lat: 17.39, lon: 78.49, region: "South Asia", family: "Rice dishes", zone: "Asia", blurb: "Aromatic layered rice with meat", recipe: true },
  { name: "Hummus", country: "Lebanon", lat: 33.89, lon: 35.49, region: "Middle East", family: "Dips", zone: "Asia", blurb: "Chickpea and tahini spread", recipe: true },
  { name: "Tiramisu", country: "Italy", lat: 45.44, lon: 12.32, region: "Southern Europe", family: "Desserts", zone: "Europe", blurb: "Coffee-soaked ladyfingers with mascarpone", recipe: true },
  { name: "Peking Duck", country: "China", lat: 39.91, lon: 116.39, region: "East Asia", family: "Poultry", zone: "Asia", blurb: "Crispy roasted duck with pancakes", recipe: true },
  { name: "Baklava", country: "Turkey", lat: 39.93, lon: 32.86, region: "Middle East", family: "Desserts", zone: "Europe", blurb: "Layered phyllo with nuts and honey", recipe: true },
];

export const FAMILY_COLORS: Record<string, string> = {
  "Egg dishes": "#C2742F",
  "Pasta": "#6E7F4E",
  "Noodle soups": "#8B7355",
  "Street foods": "#A0522D",
  "Seafood": "#3F7C8C",
  "Curries": "#B8542A",
  "Rice dishes": "#C9A849",
  "Soups": "#7A8B5C",
  "Fermented foods": "#9B6B3D",
  "Cassroles": "#8B4513",
  "Dumplings": "#C99A48",
  "Grains": "#D4A853",
  "Noodles": "#B8860B",
  "Stews": "#A0522D",
  "Dips": "#C8A46E",
  "Desserts": "#C4706B",
  "Poultry": "#B87333",
};

export const ZONE_COLORS: Record<string, string> = {
  "Africa": "#C2742F",
  "Europe": "#6E7F4E",
  "Asia": "#B8542A",
  "Americas": "#3F7C8C",
  "Oceania": "#7A8B5C",
  "Middle East": "#C9A849",
};

export interface Continent {
  name: string;
  ring: [number, number][];
}

export const CONTINENTS: Continent[] = [
  { name: "Africa", ring: [[-17, 35], [10, 35], [42, 35], [50, 12], [50, -35], [20, -35], [-17, 15]] },
  { name: "Europe", ring: [[-10, 70], [30, 70], [60, 70], [60, 35], [30, 35], [-10, 35]] },
  { name: "Asia", ring: [[60, 70], [180, 70], [180, 10], [100, 10], [60, 35], [60, 70]] },
  { name: "North America", ring: [[-170, 70], [-50, 70], [-50, 15], [-120, 15], [-170, 50]] },
  { name: "South America", ring: [[-80, 12], [-35, 12], [-35, -55], [-80, -55], [-80, 12]] },
  { name: "Oceania", ring: [[110, -10], [180, -10], [180, -45], [110, -45], [110, -10]] },
];

export const ISLANDS: [number, number, number, number][] = [
  [10, 51, 3, 2],     // British Isles
  [-8, 110, 4, 3],    // Madagascar
  [21, 158, 3, 2],    // Japan (Honshu)
  [-40, 175, 4, 2],   // New Zealand
  [1, 103, 3, 5],     // Indonesia
  [18, -70, 4, 3],    // Caribbean
];

// ============================================================================
// Settings
// ============================================================================

export interface Settings {
  accent: string;
  tone: 'cream' | 'paper' | 'warm';
  display: 'serif' | 'sans';
  mapTone: 'parchment' | 'sea' | 'night';
  colorBy: 'family' | 'zone';
  graticule: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  accent: '#B8552F',
  tone: 'cream',
  display: 'serif',
  mapTone: 'parchment',
  colorBy: 'family',
  graticule: false,
};

const TONE_VARS = {
  parchment: { water: '#EFE7D5', land: '#E0D0B0', mapline: 'rgba(33,28,22,0.13)', landstroke: 'rgba(33,28,22,0.18)' },
  sea: { water: '#CFE0DD', land: '#E7D9BD', mapline: 'rgba(33,28,22,0.10)', landstroke: 'rgba(33,28,22,0.18)' },
  night: { water: '#211C18', land: '#38302A', mapline: 'rgba(243,234,221,0.10)', landstroke: 'rgba(243,234,221,0.16)' },
};

// ============================================================================
// Tweaks Panel CSS (from deployed JS const q=)
// ============================================================================

const TWEAK_CSS = `
.twk-panel {
  position: fixed;
  right: 20px;
  top: 86px;
  width: 240px;
  background: var(--card, #FBF8F1);
  border: 1px solid var(--line, rgba(33,28,22,0.14));
  border-radius: 12px;
  padding: 18px;
  z-index: 50;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
  font-family: "Work Sans", system-ui, sans-serif;
}
.twk-h {
  font-family: "IBM Plex Mono", monospace;
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--sub, #6B6052);
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line, rgba(33,28,22,0.14));
}
.twk-section {
  margin-bottom: 14px;
}
.twk-section:last-child { margin-bottom: 0; }
.twk-sec-h {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink, #211C16);
  margin-bottom: 8px;
}
.twk-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.twk-label {
  font-size: 12px;
  color: var(--sub, #6B6052);
}
.twk-radio-grp {
  display: flex;
  gap: 4px;
  background: rgba(33,28,22,0.05);
  border-radius: 999px;
  padding: 3px;
}
.twk-radio {
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  color: var(--sub, #6B6052);
  padding: 5px 10px;
  border-radius: 999px;
  transition: all 0.14s;
}
.twk-radio[data-on="1"] {
  background: var(--card, #FBF8F1);
  color: var(--ink, #211C16);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.twk-toggle {
  width: 36px;
  height: 20px;
  border: 1.5px solid var(--line, rgba(33,28,22,0.2));
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  position: relative;
  transition: all 0.15s;
}
.twk-toggle[data-on="1"] {
  background: var(--accent, #B8552F);
  border-color: var(--accent, #B8552F);
}
.twk-toggle::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--sub, #6B6052);
  top: 1px;
  left: 1px;
  transition: all 0.15s;
}
.twk-toggle[data-on="1"]::after {
  left: 17px;
  background: white;
}
.twk-color {
  width: 28px;
  height: 28px;
  border: 2px solid var(--line, rgba(33,28,22,0.2));
  border-radius: 6px;
  cursor: pointer;
  padding: 0;
}
.twk-color::-webkit-color-swatch-wrapper { padding: 0; }
.twk-color::-webkit-color-swatch { border: none; border-radius: 4px; }
`;

// ============================================================================
// Settings Panel Component
// ============================================================================

interface SettingsPanelProps {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
}

function SettingsPanel({ settings, onSettingsChange }: SettingsPanelProps) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: TWEAK_CSS }} />
      <div className="twk-panel">
        <div className="twk-h">Tweaks</div>
        
        <div className="twk-section">
          <div className="twk-sec-h">Map</div>
          
          <div className="twk-row">
            <span className="twk-label">Tone</span>
            <div className="twk-radio-grp">
              {(['parchment', 'sea', 'night'] as const).map(tone => (
                <button
                  key={tone}
                  className="twk-radio"
                  data-on={settings.mapTone === tone ? "1" : "0"}
                  onClick={() => update('mapTone', tone)}
                >
                  {tone.charAt(0).toUpperCase() + tone.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          <div className="twk-row">
            <span className="twk-label">Color by</span>
            <div className="twk-radio-grp">
              {(['family', 'zone'] as const).map(cb => (
                <button
                  key={cb}
                  className="twk-radio"
                  data-on={settings.colorBy === cb ? "1" : "0"}
                  onClick={() => update('colorBy', cb)}
                >
                  {cb.charAt(0).toUpperCase() + cb.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          <div className="twk-row">
            <span className="twk-label">Graticule</span>
            <button
              className="twk-toggle"
              data-on={settings.graticule ? "1" : "0"}
              onClick={() => update('graticule', !settings.graticule)}
            />
          </div>
        </div>
        
        <div className="twk-section">
          <div className="twk-sec-h">Identity</div>
          
          <div className="twk-row">
            <span className="twk-label">Accent</span>
            <input
              type="color"
              className="twk-color"
              value={settings.accent}
              onChange={e => update('accent', e.target.value)}
            />
          </div>
          
          <div className="twk-row">
            <span className="twk-label">Tone</span>
            <div className="twk-radio-grp">
              {(['cream', 'paper', 'warm'] as const).map(tone => (
                <button
                  key={tone}
                  className="twk-radio"
                  data-on={settings.tone === tone ? "1" : "0"}
                  onClick={() => update('tone', tone)}
                >
                  {tone.charAt(0).toUpperCase() + tone.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          <div className="twk-row">
            <span className="twk-label">Display</span>
            <div className="twk-radio-grp">
              {(['serif', 'sans'] as const).map(d => (
                <button
                  key={d}
                  className="twk-radio"
                  data-on={settings.display === d ? "1" : "0"}
                  onClick={() => update('display', d)}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Map Component
// ============================================================================

interface MapProps {
  settings: Settings;
  selectedDish: Dish | null;
  onDishSelect: (d: Dish | null) => void;
  activeFamily: string | null;
  hiddenFamilies: Set<string>;
  colorBy: 'family' | 'zone';
}

function Map({ settings, selectedDish, onDishSelect, activeFamily, hiddenFamilies, colorBy }: MapProps) {
  const tone = TONE_VARS[settings.mapTone];
  
  // Convert lat/lon to x/y on equirectangular projection
  const toXY = (lon: number, lat: number) => {
    const x = ((lon + 180) / 360) * 100;
    const y = ((90 - lat) / 180) * 100;
    return { x, y };
  };
  
  const getDishColor = (dish: Dish) => {
    if (colorBy === 'family') {
      return FAMILY_COLORS[dish.family] || '#888';
    }
    return ZONE_COLORS[dish.zone] || '#888';
  };
  
  const isDimmed = (dish: Dish) => {
    if (activeFamily && dish.family !== activeFamily) return true;
    if (hiddenFamilies.has(dish.family)) return true;
    return false;
  };
  
  return (
    <div className="map-box" data-tone={settings.mapTone}>
      <svg className="map-svg" viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice">
        {/* Ocean */}
        <rect x="0" y="0" width="360" height="180" fill={tone.water} />
        
        {/* Graticule */}
        {settings.graticule && (
          <g stroke={tone.mapline} strokeWidth="0.3" fill="none">
            {Array.from({ length: 37 }, (_, i) => i * 10).map(lon => {
              const x = ((lon + 180) / 360) * 360;
              return <line key={`v${lon}`} x1={x} y1="0" x2={x} y2="180" />;
            })}
            {Array.from({ length: 19 }, (_, i) => i * 10 - 90).map(lat => {
              const y = ((90 - lat) / 180) * 180;
              return <line key={`h${lat}`} x1="0" y1={y} x2="360" y2={y} />;
            })}
          </g>
        )}
        
        {/* Simplified continent outlines */}
        <g fill={tone.land} stroke={tone.landstroke} strokeWidth="0.5">
          {/* Africa */}
          <path d="M100 50 L140 50 L165 50 L175 70 L165 100 L130 100 L100 80 L90 60 Z" />
          {/* Europe */}
          <path d="M165 30 L200 30 L220 45 L210 65 L180 70 L165 55 Z" />
          {/* Asia */}
          <path d="M220 30 L320 30 L320 80 L260 90 L220 70 L210 50 Z" />
          {/* North America */}
          <path d="M30 40 L100 40 L120 50 L100 90 L50 90 L30 60 Z" />
          {/* South America */}
          <path d="M90 100 L130 100 L130 150 L100 160 L85 130 Z" />
          {/* Oceania */}
          <path d="M280 120 L320 120 L320 150 L290 150 L280 140 Z" />
        </g>
        
        {/* Islands */}
        {ISLANDS.map(([lon, lat, rx, ry], i) => {
          const { x, y } = toXY(lon, lat);
          const sx = (x / 100) * 360;
          const sy = (y / 100) * 180;
          return (
            <ellipse
              key={i}
              cx={sx}
              cy={sy}
              rx={rx * 1.5}
              ry={ry}
              fill={tone.land}
              stroke={tone.landstroke}
              strokeWidth="0.3"
            />
          );
        })}
      </svg>
      
      {/* Dish pins */}
      {ATLAS_DISHES.map(dish => {
        const { x, y } = toXY(dish.lon, dish.lat);
        const sx = `calc(${x} * 1%)`;
        const sy = `calc(${y} * 1%)`;
        const color = getDishColor(dish);
        const dimmed = isDimmed(dish);
        const isSelected = selectedDish?.name === dish.name;
        
        return (
          <div
            key={dish.name}
            className="pin"
            data-sel={isSelected ? "1" : "0"}
            data-dim={dimmed ? "1" : "0"}
            style={{ left: sx, top: sy }}
            onClick={() => onDishSelect(isSelected ? null : dish)}
          >
            <div
              className="ring"
              style={{ backgroundColor: color }}
            />
            <div className="tip">{dish.name}</div>
          </div>
        );
      })}
      
      <div className="map-caption">
        {ATLAS_DISHES.length} dishes · {Object.keys(FAMILY_COLORS).length} families
      </div>
    </div>
  );
}

// ============================================================================
// Main Atlas Island Component
// ============================================================================

export default function AtlasIsland() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFamily, setActiveFamily] = useState<string | null>(null);
  const [hiddenFamilies] = useState<Set<string>>(new Set());
  
  const families = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const dish of ATLAS_DISHES) {
      counts[dish.family] = (counts[dish.family] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  }, []);
  
  const filteredDishes = useMemo(() => {
    return ATLAS_DISHES.filter(dish => {
      if (searchQuery && !dish.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (activeFamily && dish.family !== activeFamily) {
        return false;
      }
      if (hiddenFamilies.has(dish.family)) {
        return false;
      }
      return true;
    });
  }, [searchQuery, activeFamily, hiddenFamilies]);
  
  const handleFamilyToggle = useCallback((family: string) => {
    setActiveFamily(prev => prev === family ? null : family);
  }, []);
  
  const handleDishSelect = useCallback((dish: Dish | null) => {
    setSelectedDish(dish);
  }, []);
  
  const toneVars = useMemo(() => {
    const bgMap: Record<string, string> = {
      cream: '#F6F1E7',
      paper: '#F0EBE3',
      warm: '#F4EEE0',
    };
    return {
      '--bg': bgMap[settings.tone],
      '--accent': settings.accent,
    } as React.CSSProperties;
  }, [settings.tone, settings.accent]);
  
  return (
    <div
      className={`gst ${settings.display === 'sans' ? 'display-sans' : ''}`}
      style={toneVars}
    >
      {/* Navigation */}
      <nav className="gst-nav">
        <div className="wrap gst-nav-in">
          <a href="/" className="gst-brand">
            <span className="gst-wordmark">Gustale</span>
            <span className="sub">Atlas</span>
          </a>
          
          <div className="gst-navlinks">
            <a href="#">Map</a>
            <a href="/families">Families</a>
            <a href="/">Dishes</a>
            <a href="#">Data</a>
          </div>
          
          <div className="gst-navr">
            <a href="#" className="gst-ghost">Sign in</a>
            <button className="btn-accent">Contribute</button>
          </div>
        </div>
      </nav>
      
      {/* Header */}
      <div className="wrap atlas-top">
        <div>
          <div className="atlas-eyebrow">World Food Atlas</div>
          <h1 className="atlas-title">
            Every dish<br /><em>has a story</em>
          </h1>
        </div>
        
        <div className="right">
          <div className="atlas-stats">
            <div className="s">
              <b>{ATLAS_DISHES.length}</b>
              <span>Dishes</span>
            </div>
            <div className="s">
              <b>{Object.keys(FAMILY_COLORS).length}</b>
              <span>Families</span>
            </div>
            <div className="s">
              <b>{Object.keys(ZONE_COLORS).length}</b>
              <span>Zones</span>
            </div>
          </div>
          
          <div className="atlas-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search dishes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>
      
      {/* Main layout */}
      <div className="wrap atlas-layout">
        {/* Sidebar */}
        <div className="atlas-side">
          <div className="side-block">
            <div className="sb-h">Families</div>
            <div className="fam-filter">
              {families.map(([family, count]) => (
                <button
                  key={family}
                  className="ff-chip"
                  data-on={activeFamily === family ? "1" : "0"}
                  onClick={() => handleFamilyToggle(family)}
                >
                  <span className="dot" style={{ backgroundColor: FAMILY_COLORS[family] }} />
                  <span>{family}</span>
                  <span className="ct">{count}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div className="dish-list">
            {filteredDishes.length === 0 ? (
              <div className="dl-empty">No dishes found</div>
            ) : (
              filteredDishes.map(dish => (
                <div
                  key={dish.name}
                  className="dl-row"
                  data-on={selectedDish?.name === dish.name ? "1" : "0"}
                  onClick={() => handleDishSelect(dish)}
                >
                  <span
                    className="dot"
                    style={{
                      backgroundColor: settings.colorBy === 'family'
                        ? FAMILY_COLORS[dish.family]
                        : ZONE_COLORS[dish.zone]
                    }}
                  />
                  <div className="meta">
                    <div className="nm">{dish.name}</div>
                    <div className="co">{dish.country}</div>
                  </div>
                  {dish.recipe && <span className="rec">Recipe</span>}
                </div>
              ))
            )}
          </div>
        </div>
        
        {/* Map + Detail */}
        <div>
          <div className="atlas-mapwrap">
            <Map
              settings={settings}
              selectedDish={selectedDish}
              onDishSelect={handleDishSelect}
              activeFamily={activeFamily}
              hiddenFamilies={hiddenFamilies}
              colorBy={settings.colorBy}
            />
          </div>
          
          {/* Legend */}
          <div className="map-legend">
            {settings.colorBy === 'family' ? (
              families.slice(0, 8).map(([family]) => (
                <div key={family} className="lg-item">
                  <span className="sw" style={{ backgroundColor: FAMILY_COLORS[family] }} />
                  <span>{family}</span>
                </div>
              ))
            ) : (
              Object.entries(ZONE_COLORS).map(([zone, color]) => (
                <div key={zone} className="lg-item">
                  <span className="sw" style={{ backgroundColor: color }} />
                  <span>{zone}</span>
                </div>
              ))
            )}
          </div>
          
          {/* Detail card */}
          {selectedDish ? (
            <div className="detail">
              <div className="d-top">
                <span
                  className="d-dot"
                  style={{
                    backgroundColor: settings.colorBy === 'family'
                      ? FAMILY_COLORS[selectedDish.family]
                      : ZONE_COLORS[selectedDish.zone]
                  }}
                />
                <h3>{selectedDish.name}</h3>
              </div>
              <div className="d-coord mono">
                {selectedDish.lat.toFixed(2)}°, {selectedDish.lon.toFixed(2)}°
              </div>
              <p className="d-blurb">{selectedDish.blurb}</p>
              <div className="d-tags">
                <span className="d-tag">{selectedDish.family}</span>
                <span className="d-tag">{selectedDish.zone}</span>
                <span className="d-tag">{selectedDish.region}</span>
              </div>
            </div>
          ) : (
            <div className="detail empty">
              <p>Select a dish to see details</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Settings Panel */}
      <SettingsPanel settings={settings} onSettingsChange={setSettings} />
    </div>
  );
}
