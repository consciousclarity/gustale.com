import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SearchRow } from '../lib/navigation';

interface Props {
  searchSeed: SearchRow[];
  searchPrompts: string[];
  searchSuggestions: string[];
}

/**
 * Full-bleed search overlay — NOT an inline popover. The header chrome
 * dissolves and a card-catalog-style overlay takes the viewport. This is
 * a bespoke island (it does NOT reuse @gustale/ui SearchInput, which is
 * the small inline form input) but shares the same ARIA semantics.
 *
 * TODO(api): wire to /api/dishes?q=... once the search endpoint is stable.
 */
export function NavSearch({ searchSeed, searchPrompts, searchSuggestions }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [prompt, setPrompt] = useState(searchPrompts[0] ?? 'What are you looking for?');

  const overlayId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const promptIndex = useRef(0);
  // True while we are closing because the user is navigating away — skip the
  // history pop we'd otherwise do, and let the browser navigation proceed.
  const navigating = useRef(false);

  // Grouped, filtered results. Empty query → no rows (empty state shows
  // editorial suggestions instead).
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as { group: string; rows: SearchRow[] }[];
    const order: string[] = [];
    const byGroup = new Map<string, SearchRow[]>();
    for (const row of searchSeed) {
      const hay = `${row.label} ${row.meta}`.toLowerCase();
      if (!hay.includes(q)) continue;
      if (!byGroup.has(row.group)) {
        byGroup.set(row.group, []);
        order.push(row.group);
      }
      byGroup.get(row.group)!.push(row);
    }
    return order.map((group) => ({ group, rows: byGroup.get(group)! }));
  }, [query, searchSeed]);

  // Flat list of rows for keyboard navigation (mirrors render order).
  const flatRows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  const close = useCallback((viaNav = false) => {
    navigating.current = viaNav;
    setOpen(false);
  }, []);

  const openOverlay = useCallback(() => {
    promptIndex.current = (promptIndex.current + 1) % Math.max(1, searchPrompts.length);
    setPrompt(searchPrompts[promptIndex.current] ?? 'What are you looking for?');
    setQuery('');
    setActiveIndex(-1);
    setOpen(true);
  }, [searchPrompts]);

  // Global "/" shortcut — desktop only (no "/" key on iOS keyboards, and
  // we don't want to hijack typing). Ignores key presses inside fields.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!window.matchMedia('(min-width: 768px)').matches) return;
      e.preventDefault();
      if (!open) openOverlay();
      else inputRef.current?.focus();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, openOverlay]);

  // Open/close side effects: scroll lock, focus, and a history entry so the
  // browser back button closes the overlay.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.history.pushState({ gustaleSearch: true }, '');
    const onPop = () => close();
    window.addEventListener('popstate', onPop);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('popstate', onPop);
      document.body.style.overflow = prevOverflow;
      // Roll back the history entry we pushed, unless we left via navigation.
      if (!navigating.current && window.history.state?.gustaleSearch) {
        window.history.back();
      }
      navigating.current = false;
    };
  }, [open, close]);

  // Keep the active row in range when results change.
  useEffect(() => {
    setActiveIndex((i) => (i >= flatRows.length ? flatRows.length - 1 : i));
  }, [flatRows.length]);

  function onOverlayKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatRows.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, flatRows.length === 0 ? -1 : 0));
      return;
    }
    if (e.key === 'Enter') {
      const row = flatRows[activeIndex];
      if (row) {
        navigating.current = true;
        window.location.href = row.href;
      }
      return;
    }
    // Minimal focus trap: there are only two tabbable elements (input and
    // the close button), so cycle Tab between them.
    if (e.key === 'Tab') {
      const focusables = overlayRef.current?.querySelectorAll<HTMLElement>(
        'button, input, a[href]',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  let rowCursor = -1;

  return (
    <>
      <button
        type="button"
        className="gnav-iconbtn gnav-searchtrigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={overlayId}
        aria-label="Search"
        onClick={() => (open ? inputRef.current?.focus() : openOverlay())}
      >
        <SearchGlyph />
        <kbd className="gnav-key" aria-hidden="true">/</kbd>
      </button>

      {open && (
        <div
          id={overlayId}
          ref={overlayRef}
          className="gnav-overlay gnav-overlay--search"
          role="dialog"
          aria-modal="true"
          aria-label="Search Gustale"
          onKeyDown={onOverlayKeyDown}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="gnav-overlay-in">
            <button
              type="button"
              className="gnav-overlay-close"
              onClick={() => close()}
            >
              Close ✕
            </button>

            <div className="gnav-search-field">
              <input
                ref={inputRef}
                type="text"
                className="gnav-search-input"
                value={query}
                placeholder={prompt}
                autoComplete="off"
                spellCheck={false}
                aria-label="Search Gustale"
                onChange={(e) => {
                  setQuery(e.currentTarget.value);
                  setActiveIndex(-1);
                }}
              />
            </div>

            <div className="gnav-search-body">
              {query.trim() === '' && (
                <ul className="gnav-suggest" aria-label="Suggested searches">
                  {searchSuggestions.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        className="gnav-suggest-link"
                        onClick={() => {
                          setQuery(s);
                          inputRef.current?.focus();
                        }}
                      >
                        <span className="gnav-suggest-arrow" aria-hidden="true">→</span> {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {query.trim() !== '' && flatRows.length === 0 && (
                <p className="gnav-search-empty">Nothing here. Try a different word.</p>
              )}

              {groups.map((g) => (
                <div className="gnav-result-group" key={g.group}>
                  <p className="gnav-result-head">{g.group}</p>
                  {g.rows.map((row) => {
                    rowCursor += 1;
                    const idx = rowCursor;
                    return (
                      <a
                        key={`${row.group}-${row.label}`}
                        href={row.href}
                        className="gnav-result-row"
                        data-active={idx === activeIndex ? 'true' : 'false'}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          navigating.current = true;
                        }}
                      >
                        <span className="gnav-result-label">{row.label}</span>
                        <span className="gnav-result-meta">{row.meta}</span>
                      </a>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SearchGlyph() {
  return (
    <svg
      className="gnav-search-glyph"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="6" />
      <path d="M14 14l3.5 3.5" strokeLinecap="round" />
    </svg>
  );
}
