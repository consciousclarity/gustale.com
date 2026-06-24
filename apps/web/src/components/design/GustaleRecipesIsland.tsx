import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';









/* GUSTALE.RECIPES — recipe data: Shakshuka, three regional variants.
   Quantities scale from BASE servings; metric + US amounts stored per item. */

function RecPlaceholder({ label, h = 200, r = 6, t1 = '#E7DCC8', t2 = '#DCCFB4', style = {} }) {
  return (
    <div className="ph" style={{ height: h, borderRadius: r, background: `repeating-linear-gradient(135deg, ${t1} 0 14px, ${t2} 14px 28px)`, ...style }}>
      <span>{label}</span>
    </div>
  );
}

const BASE_SERVINGS = 4;

// ing(name, metricQty, metricUnit, usQty, usUnit, note)
// qty null => "to taste" / non-scaling note item
const ing = (name, qm, um, qu, uu, note) => ({ name, qm, um, qu, uu, note });

const RECIPE = {
  name: 'Shakshuka',
  baseServings: BASE_SERVINGS,
  rating: 4.8,
  ratings: 312,
  author: 'Nadia Belhadj',
  authorRole: 'Gustale contributor · Tunis',
  variants: [
    {
      id: 'tunisian',
      label: 'Tunisian',
      region: 'Maghreb',
      country: 'Tunisia',
      lat: 36.8, lon: 10.2,
      time: 35, difficulty: 'Easy',
      heroTone: ['#D98A53', '#C8743C'],
      intro: 'The Maghrebi original — fiery with harissa and warm with caraway, built on slow-cooked peppers before a single tomato joins the pan.',
      ingredients: [
        ing('Olive oil', 3, 'tbsp', 3, 'tbsp'),
        ing('Red bell peppers, sliced', 2, '', 2, ''),
        ing('Garlic cloves, sliced', 3, '', 3, ''),
        ing('Harissa paste', 1, 'tbsp', 1, 'tbsp'),
        ing('Caraway seeds, ground', 1, 'tsp', 1, 'tsp'),
        ing('Ripe tomatoes, chopped', 600, 'g', 21, 'oz'),
        ing('Tomato paste', 1, 'tbsp', 1, 'tbsp'),
        ing('Eggs', 4, '', 4, ''),
        ing('Sea salt', null, '', null, '', 'to taste'),
        ing('Flatbread', null, '', null, '', 'to serve'),
      ],
      steps: [
        { t: 8, text: 'Warm the olive oil in a wide pan over medium heat. Add the sliced peppers and cook gently until soft and sweet.' },
        { t: 1, text: 'Stir in the garlic, harissa, and ground caraway. Cook just until fragrant and the harissa darkens.' },
        { t: 14, text: 'Add the chopped tomatoes and tomato paste. Simmer, stirring now and then, until thick and jammy. Season with salt.' },
        { t: 7, text: 'Make wells in the sauce and crack in the eggs. Cover and cook until the whites are set but the yolks stay soft.' },
        { t: 1, text: 'Finish with a drizzle of olive oil and a pinch more caraway.' },
        { t: 0, text: 'Serve straight from the pan with warm flatbread for scooping.' },
      ],
    },
    {
      id: 'levantine',
      label: 'Israeli / Levantine',
      region: 'Levant',
      country: 'Israel & Palestine',
      lat: 31.8, lon: 35.2,
      time: 40, difficulty: 'Easy',
      heroTone: ['#D87E4A', '#C46B34'],
      intro: 'The café classic of the eastern Mediterranean — cumin and paprika, a base of onion and pepper, finished with crumbled feta and a fistful of soft herbs.',
      ingredients: [
        ing('Olive oil', 3, 'tbsp', 3, 'tbsp'),
        ing('Onion, diced', 1, '', 1, ''),
        ing('Red bell pepper, diced', 1, '', 1, ''),
        ing('Garlic cloves, minced', 3, '', 3, ''),
        ing('Cumin, ground', 1, 'tsp', 1, 'tsp'),
        ing('Sweet paprika', 1, 'tsp', 1, 'tsp'),
        ing('Tomatoes, chopped', 700, 'g', 25, 'oz'),
        ing('Eggs', 5, '', 5, ''),
        ing('Feta, crumbled', 80, 'g', 3, 'oz'),
        ing('Parsley & cilantro, chopped', null, '', null, '', 'a handful'),
        ing('Salt & black pepper', null, '', null, '', 'to taste'),
      ],
      steps: [
        { t: 7, text: 'Heat the olive oil over medium. Soften the onion and pepper until translucent and just colouring at the edges.' },
        { t: 1, text: 'Add the garlic, cumin, and paprika. Toast in the oil until the kitchen smells of warm spice.' },
        { t: 15, text: 'Pour in the tomatoes. Simmer until reduced to a thick, glossy sauce. Taste and season well.' },
        { t: 8, text: 'Scatter over the feta. Make wells and crack in the eggs; cover and cook to your preferred set.' },
        { t: 1, text: 'Shower with chopped parsley and cilantro and a final drizzle of oil.' },
        { t: 0, text: 'Bring the pan to the table with bread, and eat at once.' },
      ],
    },
    {
      id: 'yemenite',
      label: 'Yemenite',
      region: 'Arabian Peninsula',
      country: 'Yemen',
      lat: 15.4, lon: 44.2,
      time: 45, difficulty: 'Medium',
      heroTone: ['#CF7644', '#BC632F'],
      intro: 'A deeper, spice-forward take lifted by zhug — the fresh green chili-and-coriander relish — and a whisper of hawaij, finished with cool labneh.',
      ingredients: [
        ing('Olive oil', 3, 'tbsp', 3, 'tbsp'),
        ing('Onion, diced', 1, '', 1, ''),
        ing('Green chilies, sliced', 2, '', 2, ''),
        ing('Garlic cloves', 4, '', 4, ''),
        ing('Hawaij spice blend', 2, 'tsp', 2, 'tsp'),
        ing('Tomatoes, chopped', 700, 'g', 25, 'oz'),
        ing('Eggs', 4, '', 4, ''),
        ing('Zhug (green chili relish)', 2, 'tbsp', 2, 'tbsp'),
        ing('Labneh', 4, 'tbsp', 4, 'tbsp', 'to serve'),
        ing('Fresh coriander', null, '', null, '', 'to finish'),
        ing('Salt', null, '', null, '', 'to taste'),
      ],
      steps: [
        { t: 8, text: 'Sweat the onion and green chilies in the olive oil until soft, sweet, and lightly golden.' },
        { t: 1, text: 'Stir in the garlic and hawaij, letting the blend bloom and perfume the oil.' },
        { t: 16, text: 'Add the tomatoes and simmer low and slow until dark, thick, and concentrated. Season with salt.' },
        { t: 8, text: 'Swirl through half the zhug. Make wells, add the eggs, cover, and cook until just set.' },
        { t: 1, text: 'Spoon over the remaining zhug and dot with cool labneh.' },
        { t: 0, text: 'Finish with torn coriander and serve with flatbread or rice.' },
      ],
    },
  ],
  related: [
    { name: 'Menemen', place: 'TÜRKIYE', meta: 'Soft scramble · peppers', t1: '#E5D3B9', t2: '#D7C2A0' },
    { name: 'Huevos Rancheros', place: 'MEXICO', meta: 'Fried eggs · salsa', t1: '#E7D2B6', t2: '#DAC09E' },
    { name: 'Eggs in Purgatory', place: 'ITALY', meta: 'Eggs · spiced tomato', t1: '#E4D4BD', t2: '#D6C3A4' },
    { name: 'Chakchouka Verte', place: 'ALGERIA', meta: 'Green peppers · herbs', t1: '#E2D6BE', t2: '#D4C6A6' },
  ],
};

if (typeof window !== 'undefined') Object.assign(window, { RecPlaceholder, RECIPE, BASE_SERVINGS });


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


/* GUSTALE.RECIPES — recipe app: hero, live customization, method, cook mode, Tweaks. */



const REC_TONES = {
  cream: { '--bg': '#F6F1E7', '--card': '#FBF8F1' },
  paper: { '--bg': '#F1EBDD', '--card': '#F8F3E8' },
  warm:  { '--bg': '#FAF7F0', '--card': '#FFFFFF' },
};

const REC_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#B8552F",
  "tone": "cream",
  "display": "serif",
  "radius": 6,
  "defaultUnits": "metric",
  "defaultServings": 4,
  "showRelated": true
}/*EDITMODE-END*/;

// ---- quantity formatting ----
const FRACS = [[0, ''], [0.125, '⅛'], [0.25, '¼'], [0.333, '⅓'], [0.5, '½'], [0.667, '⅔'], [0.75, '¾'], [1, '+1']];
function fracFormat(n) {
  const whole = Math.floor(n + 1e-6);
  const frac = n - whole;
  let best = FRACS[0], bd = Infinity;
  for (const f of FRACS) { const d = Math.abs(frac - f[0]); if (d < bd) { bd = d; best = f; } }
  let w = whole, fs = best[1];
  if (fs === '+1') { w += 1; fs = ''; }
  if (w > 0 && fs) return `${w}${fs}`;
  if (w > 0) return `${w}`;
  if (fs) return fs;
  return '0';
}
function niceNum(n, unit) {
  if (unit === 'g') return String(Math.max(5, Math.round(n / 5) * 5));
  return fracFormat(n);
}
function qtyText(ing, scale, units) {
  const q = units === 'metric' ? ing.qm : ing.qu;
  const u = units === 'metric' ? ing.um : ing.uu;
  if (q == null) return null;
  const val = niceNum(q * scale, u);
  return u ? `${val} ${u}` : val;
}

const Check = () => (<svg viewBox="0 0 14 14" fill="none" stroke="#FBEFE6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7.3 5.7 10 11 4.2" /></svg>);

function CookMode({ variant, recipeName, onClose }) {
  const steps = variant.steps;
  const [i, setI] = React.useState(0);
  const go = (d) => setI((p) => Math.max(0, Math.min(steps.length - 1, p + d)));
  React.useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });
  const s = steps[i];
  return (
    <div className="cook">
      <div className="cook-prog" style={{ width: `${((i + 1) / steps.length) * 100}%` }} />
      <div className="cook-top">
        <div className="ct-title disp">{recipeName} <span style={{ opacity: 0.5 }}>· {variant.label}</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span className="ct-meta">STEP {i + 1} / {steps.length}</span>
          <button className="cook-x" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="cook-body">
        <div className="cook-num disp">Step {String(i + 1).padStart(2, '0')}</div>
        <p className="cook-step disp">{s.text}</p>
        {s.t > 0 && <div className="cook-time">~ <b>{s.t}</b> min</div>}
      </div>
      <div className="cook-nav">
        <button className="cook-arrow" onClick={() => go(-1)} disabled={i === 0}>‹</button>
        <div className="cook-dots">{steps.map((_, j) => <i key={j} data-on={j === i ? '1' : '0'} />)}</div>
        <button className="cook-arrow" onClick={() => go(1)} disabled={i === steps.length - 1}>›</button>
      </div>
    </div>
  );
}

function RecipeApp() {
  const [t, setTweak] = useTweaks(REC_TWEAK_DEFAULTS);
  

  const [vIdx, setVIdx] = React.useState(0);
  const [servings, setServings] = React.useState(t.defaultServings);
  const [units, setUnits] = React.useState(t.defaultUnits);
  const [checked, setChecked] = React.useState({});
  const [cooking, setCooking] = React.useState(false);

  React.useEffect(() => { setServings(t.defaultServings); }, [t.defaultServings]);
  React.useEffect(() => { setUnits(t.defaultUnits); }, [t.defaultUnits]);

  const variant = RECIPE.variants[vIdx];
  const scale = servings / RECIPE.baseServings;
  const totalTime = Math.round(variant.steps.reduce((a, s) => a + s.t, 0)) || variant.time;

  const toggleCheck = (k) => setChecked((c) => ({ ...c, [k]: !c[k] }));

  const rootStyle = {
    ...REC_TONES[t.tone],
    '--accent': t.accent,
    '--accent-ink': '#FBEFE6',
    '--accent-soft': `color-mix(in srgb, ${t.accent} 12%, transparent)`,
    '--radius': t.radius + 'px',
    '--radius-lg': (t.radius + 4) + 'px',
  };

  return (
    <div className={'gst' + (t.display === 'sans' ? ' display-sans' : '')} style={rootStyle}>

      {/* NAV */}
      <nav className="gst-nav">
        <div className="wrap gst-nav-in">
          <div className="gst-brand">
            <span className="gst-wordmark">Gustale</span>
            <span className="sub">Recipes</span>
          </div>
          <div className="gst-navlinks">
            <a href="#">Browse</a><a href="#">Collections</a><a href="#">Contributors</a><a href="Gustale Homepage.html">↗ Atlas</a>
          </div>
          <div className="gst-navr">
            <a className="gst-ghost" href="#">Sign in</a>
            <button className="btn-accent">Save recipe</button>
          </div>
        </div>
      </nav>

      <main className="wrap">
        {/* breadcrumb */}
        <div className="crumb">
          <a href="#">Atlas</a><span className="sep">›</span>
          <a href="#">{variant.region}</a><span className="sep">›</span>
          <a href="#">Eggs &amp; tomato</a><span className="sep">›</span>
          <span style={{ color: 'var(--ink)' }}>{RECIPE.name}</span>
        </div>

        {/* HERO */}
        <header className="rec-hero">
          <div>
            <div className="rec-eyebrow">
              {variant.region} · {variant.country}
              <span className="coord">{variant.lat.toFixed(1)}, {variant.lon.toFixed(1)}</span>
            </div>
            <h1 className="rec-title">{RECIPE.name}</h1>
            <p className="rec-intro">{variant.intro}</p>
            <div className="rec-byline">
              <span className="av"></span>
              <span>By <b>{RECIPE.author}</b> · {RECIPE.authorRole}</span>
              <span className="star">★ {RECIPE.rating}</span>
              <span style={{ opacity: 0.7 }}>({RECIPE.ratings})</span>
            </div>
            <div className="rec-meta">
              <div className="cell"><div className="k">Total time</div><div className="v">{totalTime}<small> min</small></div></div>
              <div className="cell"><div className="k">Serves</div><div className="v">{servings}</div></div>
              <div className="cell"><div className="k">Difficulty</div><div className="v" style={{ fontSize: 19 }}>{variant.difficulty}</div></div>
              <div className="cell"><div className="k">Variant</div><div className="v" style={{ fontSize: 19 }}>{variant.label.split(' ')[0]}</div></div>
            </div>
            <div className="rec-actions">
              <button className="cookmode-btn" onClick={() => setCooking(true)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 2l9 5-9 5z" /></svg>
                Start cook mode
              </button>
              <button className="btn-outline">♡ Save</button>
              <button className="btn-outline">↑ Share</button>
            </div>
          </div>
          <div className="rec-heroimg">
            <RecPlaceholder label={`dish photo · shakshuka (${variant.label.toLowerCase()})`} h={420} t1={variant.heroTone[0]} t2={variant.heroTone[1]} />
            <div className="cap"><span>HERO · 4:3</span><span>{variant.country.toUpperCase()}</span></div>
          </div>
        </header>

        {/* VARIANT SWITCHER */}
        <div className="variant-bar">
          <span className="lbl">One dish, three tables</span>
          <div className="variants">
            {RECIPE.variants.map((v, i) => (
              <button key={v.id} className="variant" data-on={i === vIdx ? '1' : '0'} onClick={() => setVIdx(i)}>
                <span className="nm">{v.label}</span>
                <span className="rg">{v.region.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>

        {/* CUSTOMIZE BAR */}
        <div className="customize" data-omelette-chrome="">
          <div className="cz-group">
            <span className="lbl">Servings</span>
            <div className="stepper">
              <button onClick={() => setServings((s) => Math.max(1, s - 1))}>−</button>
              <span className="val"><b>{servings}</b> {servings === 1 ? 'plate' : 'plates'}</span>
              <button onClick={() => setServings((s) => Math.min(12, s + 1))}>+</button>
            </div>
          </div>
          <div className="cz-group">
            <span className="lbl">Units</span>
            <div className="pillset">
              {[['metric', 'Metric'], ['us', 'US']].map(([v, l]) => (
                <button key={v} data-on={units === v ? '1' : '0'} onClick={() => setUnits(v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="cz-spacer" />
          <button className="cookmode-btn" onClick={() => setCooking(true)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 2l9 5-9 5z" /></svg>
            Cook mode
          </button>
        </div>

        {/* BODY: ingredients + method */}
        <div className="rec-body">
          <aside className="ing-col">
            <h2 className="col-h">Ingredients</h2>
            <div className="col-sub">FOR {servings} · {variant.label.toUpperCase()} · {units === 'metric' ? 'METRIC' : 'US'}</div>
            <div className="ing-list">
              {variant.ingredients.map((it, i) => {
                const k = `${variant.id}:${i}`;
                const q = qtyText(it, scale, units);
                return (
                  <div className="ing" key={k} data-checked={checked[k] ? '1' : '0'} onClick={() => toggleCheck(k)}>
                    <span className="box"><Check /></span>
                    <span className="qty">{q || <span style={{ color: 'var(--sub)', fontStyle: 'italic' }}>{it.note}</span>}</span>
                    <span className="nm">{it.name}{q && it.note ? <small>{it.note}</small> : null}</span>
                  </div>
                );
              })}
            </div>
            <div className="ing-foot">⊕ Add all to shopping list</div>
          </aside>

          <section>
            <h2 className="col-h">Method</h2>
            <div className="col-sub">{variant.steps.length} STEPS · ~{totalTime} MIN ACTIVE</div>
            <div className="method-list">
              {variant.steps.map((s, i) => (
                <div className="step" key={i}>
                  <div className="marker disp">{String(i + 1).padStart(2, '0')}</div>
                  <div>
                    <div className="stxt">{s.text}</div>
                    {s.t > 0 && <span className="stime">⏱ <b>{s.t}</b> min</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* AROUND THE WORLD */}
        <section className="world">
          <div>
            <div className="tag">The same dish, localized</div>
            <h2>Shakshuka around the world.</h2>
            <p>The same idea — eggs poached in spiced tomato — told differently across the southern
              Mediterranean and beyond. Switch the recipe to any of its regional tables.</p>
            <a className="btn-outline" href="Gustale Homepage.html" style={{ textDecoration: 'none' }}>Open in the Atlas →</a>
          </div>
          <div className="world-list">
            {RECIPE.variants.map((v, i) => (
              <div className="world-item" key={v.id} onClick={() => { setVIdx(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                <span className="pin"></span>
                <span className="wnm">{v.label}</span>
                <span className="wrg">{v.country}</span>
                <span className="wcd">{v.lat.toFixed(1)}, {v.lon.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* RELATED */}
        {t.showRelated && (
          <section className="section">
            <div className="sec-rule"><h2>In the same family</h2><a href="#">All egg dishes →</a></div>
            <div className="related">
              {RECIPE.related.map((r) => (
                <article className="rel-card" key={r.name}>
                  <RecPlaceholder label={`dish · ${r.name.toLowerCase()}`} h={200} t1={r.t1} t2={r.t2} />
                  <h3>{r.name}</h3>
                  <div className="pl">{r.place}</div>
                  <div className="mt">{r.meta}</div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* FOOTER */}
        <footer className="gst-foot">
          <div>
            <div className="fm">Gustale <span style={{ color: 'var(--accent)' }}>Recipes</span></div>
            <div className="fcap">gustale.recipes · part of the gustale.com atlas</div>
          </div>
          <div className="fl">
            <a href="#">Browse</a><a href="#">Contribute</a><a href="Gustale Homepage.html">Atlas</a><a href="#">About</a>
          </div>
        </footer>
      </main>

      {cooking && <CookMode variant={variant} recipeName={RECIPE.name} onClose={() => setCooking(false)} />}

      {/* TWEAKS */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Recipe defaults" />
        <TweakRadio label="Default units" value={t.defaultUnits} options={[{ value: 'metric', label: 'Metric' }, { value: 'us', label: 'US' }]} onChange={(v) => setTweak('defaultUnits', v)} />
        <TweakSlider label="Default servings" value={t.defaultServings} min={1} max={12} unit=" plates" onChange={(v) => setTweak('defaultServings', v)} />
        <TweakToggle label="Show related recipes" value={t.showRelated} onChange={(v) => setTweak('showRelated', v)} />

        <TweakSection label="Identity" />
        <TweakColor label="Accent" value={t.accent} options={['#B8552F', '#9E4A4A', '#5E6B3A', '#2C2A24']} onChange={(v) => setTweak('accent', v)} />
        <TweakRadio label="Background" value={t.tone} options={[{ value: 'cream', label: 'Cream' }, { value: 'paper', label: 'Paper' }, { value: 'warm', label: 'Warm' }]} onChange={(v) => setTweak('tone', v)} />
        <TweakRadio label="Display type" value={t.display} options={[{ value: 'serif', label: 'Serif' }, { value: 'sans', label: 'Sans' }]} onChange={(v) => setTweak('display', v)} />
        <TweakSlider label="Corner radius" value={t.radius} min={0} max={16} unit="px" onChange={(v) => setTweak('radius', v)} />
      </TweaksPanel>
    </div>
  );
}



export default RecipeApp;
