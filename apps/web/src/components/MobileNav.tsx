import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AuthMenu } from './AuthMenu';
import { isLinkActive, type NavLink, type PropertyRef } from '../lib/navigation';

interface Props {
  primary: NavLink[];
  current: PropertyRef;
  other: PropertyRef;
  pathname: string;
}

type Phase = 'closed' | 'open' | 'closing';

/**
 * Mobile navigation as a full-bleed takeover — the genre cue is "opening
 * the cover of a book", not a hamburger drawer or a bottom sheet. Entrance
 * fades in with a subtle per-link stagger; exit reverses without stagger.
 * Hard navigation closes immediately (the page unloads anyway).
 */
export function MobileNav({ primary, current, other, pathname }: Props) {
  const [phase, setPhase] = useState<Phase>('closed');
  const overlayId = useId();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const navigating = useRef(false);

  const open = phase !== 'closed';

  const close = useCallback(() => {
    setPhase((p) => (p === 'open' ? 'closing' : p));
  }, []);

  // Drive the 200ms exit, then unmount.
  useEffect(() => {
    if (phase !== 'closing') return;
    closeTimer.current = window.setTimeout(() => setPhase('closed'), 200);
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, [phase]);

  // Scroll lock + history entry while the takeover is mounted.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.history.pushState({ gustaleMenu: true }, '');
    const onPop = () => close();
    window.addEventListener('popstate', onPop);
    const focusTimer = window.setTimeout(
      () => overlayRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(),
      20,
    );
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('popstate', onPop);
      document.body.style.overflow = prevOverflow;
      if (!navigating.current && window.history.state?.gustaleMenu) {
        window.history.back();
      }
      navigating.current = false;
    };
  }, [open, close]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = overlayRef.current?.querySelectorAll<HTMLElement>(
        'button, a[href]',
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

  return (
    <>
      <button
        type="button"
        className="gnav-menutrigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={overlayId}
        onClick={() => (open ? close() : setPhase('open'))}
      >
        Menu
      </button>

      {open && (
        <div
          id={overlayId}
          ref={overlayRef}
          className="gnav-overlay gnav-overlay--menu"
          data-phase={phase}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          onKeyDown={onKeyDown}
        >
          <div className="gnav-menu-in">
            <a
              href={current.href.replace(/^https?:\/\/[^/]+/, '') || '/'}
              className="gnav-menu-wordmark"
              data-autofocus
              onClick={(e) => {
                // Tap the wordmark to close (don't leave the page).
                e.preventDefault();
                close();
              }}
            >
              gustale<span className="gnav-period">.</span>
            </a>

            <div className="gnav-menu-rule" aria-hidden="true" />

            <nav className="gnav-menu-links" aria-label="Primary">
              {primary.map((link, i) => {
                const active = isLinkActive(link, pathname);
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    className="gnav-menu-link"
                    data-active={active ? 'true' : 'false'}
                    aria-current={active ? 'page' : undefined}
                    style={{ animationDelay: `${i * 40}ms` }}
                    onClick={() => {
                      navigating.current = true;
                    }}
                  >
                    {active && <span className="gnav-menu-tri" aria-hidden="true">▸ </span>}
                    {link.label}
                  </a>
                );
              })}
            </nav>

            <div className="gnav-menu-foot">
              <nav className="gnav-menu-props" aria-label="Switch property">
                <a
                  href={current.href}
                  className="gnav-menu-prop"
                  data-active="true"
                  aria-current="true"
                >
                  {current.label}
                </a>
                <a href={other.href} className="gnav-menu-prop" data-active="false">
                  {other.label}
                </a>
              </nav>

              <nav className="gnav-menu-account" aria-label="User">
                <AuthMenu variant="mobile" />
              </nav>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
