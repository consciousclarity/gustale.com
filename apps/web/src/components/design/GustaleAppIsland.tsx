// @ts-nocheck
// Legacy design-reference file — not actively used in the build.
// Suppressed to silence pre-existing implicit-any and UMD global errors.
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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

Object.assign(window, {
  useTweaks, TweaksPanel, TweakSection, TweakRow,
  TweakSlider, TweakToggle, TweakRadio, TweakSelect,
  TweakText, TweakNumber, TweakColor, TweakButton,
});

/* GUSTALE — shared data + helpers */

// Placeholder tile with a mono caption
function Placeholder({ label, h = 200, r = 5, t1 = '#E7DCC8', t2 = '#DCCFB4', style = {} }) {
  return (
    <div className="ph" style={{
      height: h, borderRadius: r,
      background: `repeating-linear-gradient(135deg, ${t1} 0 14px, ${t2} 14px 28px)`,
      ...style,
    }}>
      <span>{label}</span>
    </div>
  );
}

// 12 dishes — the dataset every browse mode renders.
const DISHES = [
  { id: 'tonkotsu', name: 'Tonkotsu Ramen', origin: 'Fukuoka', country: 'Japan', region: 'East Asia', type: 'noodle soup', variants: 24, lat: 33.6, lon: 130.4, updated: '2d', t1: '#E9D6C0', t2: '#DCC6A8',
    note: 'A milky pork-bone broth simmered for a day — Fukuoka’s answer to cold harbor mornings.',
    long: 'Born in the yatai street stalls of Hakata, tonkotsu turns humble pork bones into a broth so rich it clings to thin, firm noodles. Its spread north mirrors Japan’s rail lines.' },
  { id: 'mole', name: 'Mole Poblano', origin: 'Puebla', country: 'Mexico', region: 'Mesoamerica', type: 'sauce', variants: 11, lat: 19.0, lon: -98.2, updated: '5d', t1: '#E4D2BC', t2: '#D6C0A2',
    note: 'Chilies, chocolate, and a convent’s worth of spices, ground into a single dark sauce.',
    long: 'Legend places its invention in a Pueblan convent; history places it at the crossroads of Indigenous chilies and goods carried by trade. Dozens of ingredients, one velvet sauce.' },
  { id: 'shakshuka', name: 'Shakshuka', origin: 'Maghreb', country: 'Tunisia', region: 'North Africa', type: 'egg dish', variants: 17, lat: 36.8, lon: 10.2, updated: '1d', t1: '#E9D9C2', t2: '#DDC9AA',
    note: 'Eggs poached in a simmering pepper-and-tomato sauce, scooped up with bread.',
    long: 'A dish of the whole southern Mediterranean, claimed by many kitchens. Its name means “mixture” — peppers, tomatoes, and eggs, varied by every household and border it crosses.' },
  { id: 'ceviche', name: 'Ceviche', origin: 'Lima', country: 'Peru', region: 'Andes', type: 'cured raw fish', variants: 22, lat: -12.0, lon: -77.0, updated: '3d', t1: '#E6DAC6', t2: '#D8C9AE',
    note: 'Raw fish “cooked” in lime and chili — born of cold currents and citrus trade.',
    long: 'The Humboldt current gave Peru its fish; the Spanish brought citrus. Ceviche is the meeting point, cured in minutes and eaten the same hour it is caught.' },
  { id: 'injera', name: 'Injera', origin: 'Highlands', country: 'Ethiopia', region: 'East Africa', type: 'flatbread', variants: 6, lat: 9.0, lon: 38.7, updated: '6d', t1: '#E4D7C6', t2: '#D6C4AC',
    note: 'A spongy, fermented teff flatbread that doubles as both plate and utensil.',
    long: 'Fermented for days from tiny teff grains, injera is the table itself — stews are ladled on top, and the bread is torn to scoop them. Sour, airy, and unmistakably highland.' },
  { id: 'bibimbap', name: 'Bibimbap', origin: 'Jeonju', country: 'Korea', region: 'East Asia', type: 'rice bowl', variants: 9, lat: 35.8, lon: 127.1, updated: '4d', t1: '#E8D8C0', t2: '#DBC8A9',
    note: 'Rice crowned with seasoned vegetables, egg, and gochujang — mixed at the table.',
    long: 'A bowl built for balance: each vegetable seasoned on its own, arranged by color, then stirred into one. Jeonju’s version is the benchmark every other measures against.' },
  { id: 'khachapuri', name: 'Khachapuri', origin: 'Adjara', country: 'Georgia', region: 'Caucasus', type: 'filled bread', variants: 8, lat: 41.6, lon: 41.6, updated: '2d', t1: '#EADBC2', t2: '#DECDA9',
    note: 'A boat of bread filled with molten cheese, an egg cracked into the center.',
    long: 'Every Georgian region shapes it differently; Adjara’s is a glistening boat by the Black Sea, finished with butter and a runny yolk to stir through the cheese.' },
  { id: 'feijoada', name: 'Feijoada', origin: 'Rio', country: 'Brazil', region: 'South America', type: 'bean stew', variants: 6, lat: -22.9, lon: -43.2, updated: '7d', t1: '#E2D4BE', t2: '#D4C3A6',
    note: 'A slow black-bean stew of smoked and salted meats — Saturday in a pot.',
    long: 'Built from preservation and patience, feijoada gathers cuts that keep — smoked, salted, cured — over black beans, and gathers people around the long midday table.' },
  { id: 'adobo', name: 'Adobo', origin: 'Luzon', country: 'Philippines', region: 'Maritime SE Asia', type: 'braise', variants: 14, lat: 14.6, lon: 121.0, updated: '1d', t1: '#E9D7BE', t2: '#DDCBA8',
    note: 'Meat braised in vinegar, soy, and garlic — a preservation method turned national dish.',
    long: 'Before refrigeration, vinegar kept the day’s catch and meat. The Spanish gave the technique a name; Filipino kitchens made it the most-argued, best-loved dish in the islands.' },
  { id: 'pho', name: 'Phở', origin: 'Hanoi', country: 'Vietnam', region: 'Mainland SE Asia', type: 'noodle soup', variants: 12, lat: 21.0, lon: 105.8, updated: '3d', t1: '#E6D8BF', t2: '#D9C8A8',
    note: 'Clear beef broth, charred aromatics, rice noodles, a fistful of fresh herbs.',
    long: 'A northern morning bowl that traveled south and then across oceans. Its clarity is the craft — bones, charred ginger and onion, star anise, skimmed for hours.' },
  { id: 'tagine', name: 'Tagine', origin: 'Fes', country: 'Morocco', region: 'North Africa', type: 'slow stew', variants: 15, lat: 34.0, lon: -5.0, updated: '5d', t1: '#EAD9BF', t2: '#DECBA9',
    note: 'A conical clay pot that steams meat, fruit, and spice into tender submission.',
    long: 'The pot is the recipe: its cone catches steam and returns it, slow-cooking lamb with preserved lemon, olives, or apricot over coals across the Maghreb.' },
  { id: 'pierogi', name: 'Pierogi', origin: 'Kraków', country: 'Poland', region: 'Central Europe', type: 'dumpling', variants: 10, lat: 50.0, lon: 19.9, updated: '6d', t1: '#E7DAC4', t2: '#DACAAD',
    note: 'Half-moons of dough folded around potato, cheese, mushroom, or fruit.',
    long: 'One of a worldwide dumpling family, pierogi anchor the Central European table — boiled then pan-crisped, savory for supper and sweet for after.' },
];

// macro-regions, ordered, for atlas grouping
const REGION_ORDER = ['East Asia', 'Mainland SE Asia', 'Maritime SE Asia', 'Andes', 'Mesoamerica', 'South America', 'North Africa', 'East Africa', 'Caucasus', 'Central Europe'];

const TRENDING = [
  { name: 'Oaxaca', place: 'Mexico', note: 'Smoke, chili & masa', t1: '#E6D2BA', t2: '#D8C2A2' },
  { name: 'Sichuan', place: 'China', note: 'Numbing, fragrant heat', t1: '#E4D4BE', t2: '#D6C4A6' },
  { name: 'Levant', place: 'Eastern Med.', note: 'Olive, lemon, char', t1: '#E9DCC4', t2: '#DCCDAC' },
  { name: 'Andhra', place: 'India', note: 'The hottest south', t1: '#E8D6BE', t2: '#DBC8A8' },
];

const CRAVINGS = ['Spicy', 'Fermented', 'Street food', 'Comfort', 'Citrus-bright', 'Smoky', 'Sweet-savory', 'Sour', 'Slow-cooked', 'Herbaceous'];

const COLLECTIONS = [
  ['Dishes', '14,283', 'cooked preparations & plated meals'],
  ['Ingredients', '9,612', 'raw and processed components'],
  ['Regions', '1,940', 'culinary territories, nested'],
  ['Techniques', '740', 'methods from braising to nixtamal'],
  ['Origins', '190', 'countries & contested homelands'],
  ['Producers', '5,118', 'makers, farms & appellations'],
];

Object.assign(window, { Placeholder, DISHES, REGION_ORDER, TRENDING, CRAVINGS, COLLECTIONS });

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

/* GUSTALE — main app: assembles the page + wires browse modes + Tweaks. */


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

export default GustaleApp;
