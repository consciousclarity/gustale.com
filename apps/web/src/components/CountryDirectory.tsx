import { useEffect, useMemo, useState } from "react";
import {
  browseStatusMessage,
  buildCountryDirectory,
  type CountryEntry,
  countryAlphaIndex,
  filterCountryDirectory,
  type LikeableDish,
  mapBrowseHref,
  recoveryLinks,
} from "../lib/browse";
import { currentDomain } from "../lib/domain";
import { filterHref, type PathPageSlugs } from "../lib/filterPages";

export interface CountryDirectoryProps {
  /** Filtered lists that have a static path page. */
  pathPages?: PathPageSlugs | null;
  dishes: LikeableDish[];
}

export function CountryDirectory({
  dishes,
  pathPages = null,
}: CountryDirectoryProps) {
  const domain = currentDomain();
  const all = useMemo(() => buildCountryDirectory(dishes), [dishes]);
  const [q, setQ] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("q") ?? "";
  });
  const [activeLetter, setActiveLetter] = useState<string | null>(null);

  const filtered = useMemo(() => filterCountryDirectory(all, q), [all, q]);
  const visible = useMemo(() => {
    if (!activeLetter) return filtered;
    return filtered.filter((c) => c.letter === activeLetter);
  }, [filtered, activeLetter]);
  const letters = useMemo(() => countryAlphaIndex(filtered), [filtered]);
  const recovery = recoveryLinks(domain);
  const mapHref = mapBrowseHref(domain);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (activeLetter) sp.set("letter", activeLetter);
    const qs = sp.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    const cur = `${window.location.pathname}${window.location.search}`;
    if (next !== cur) window.history.replaceState({}, "", next);
  }, [q, activeLetter]);

  useEffect(() => {
    const onPop = () => {
      const sp = new URLSearchParams(window.location.search);
      setQ(sp.get("q") ?? "");
      setActiveLetter(sp.get("letter"));
    };
    // seed letter from URL once
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("letter")) setActiveLetter(sp.get("letter"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const status = browseStatusMessage({
    loading: false,
    failed: false,
    count: visible.length,
    query: q || activeLetter || "",
    noun: "origin",
    nounPlural: "origins",
  });

  return (
    <div className="browse-shell">
      <div
        className="browse-toolbar browse-toolbar--island"
        data-browse-toolbar
      >
        <div className="browse-toolbar-row">
          <div className="browse-search">
            <label className="browse-search-sr" htmlFor="country-browse-search">
              Search origins
            </label>
            <input
              id="country-browse-search"
              type="search"
              className="browse-search-field"
              placeholder="Search origins or dishes…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActiveLetter(null);
              }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <p className="browse-count" aria-live="polite" aria-atomic="true">
            {status}
          </p>
          {(q || activeLetter) && (
            <button
              type="button"
              className="browse-clear"
              onClick={() => {
                setQ("");
                setActiveLetter(null);
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <nav className="browse-alpha" aria-label="Jump by letter">
        {letters.map((letter) => (
          <button
            key={letter}
            type="button"
            className={`browse-alpha__btn${activeLetter === letter ? " is-on" : ""}`}
            onClick={() =>
              setActiveLetter((cur) => (cur === letter ? null : letter))
            }
            aria-pressed={activeLetter === letter}
          >
            {letter}
          </button>
        ))}
      </nav>

      <p className="browse-crosslinks">
        <a href={mapHref}>Open the map</a>
        <span aria-hidden="true"> · </span>
        <a href="/families">Food families</a>
      </p>

      {visible.length === 0 && (
        <div className="browse-banner" role="status">
          <p>No origins match{q ? ` “${q}”` : ""}.</p>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              setQ("");
              setActiveLetter(null);
            }}
          >
            Clear search
          </button>
          <ul className="browse-recovery">
            {recovery.primary.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="browse-dir">
        {visible.map((c: CountryEntry) => (
          <li
            key={c.name}
            id={`country-${c.letter}-${c.name.replace(/\s+/g, "-")}`}
          >
            <a
              className="browse-dir-card"
              href={filterHref(pathPages, "region", c.name)}
            >
              <div className="browse-dir-card__top">
                {/* PR 2 — ONE LINK PER CARD.
                    This card had NO link of its own: the country name
                    was a bare <h2> and the only links were the dish
                    names below it. So the card had no single link to
                    itself, and a reader could not get from "Mexico" to
                    "the dishes from Mexico" — they had to pick one
                    dish.

                    The card now follows the SAME pattern the families
                    directory already uses (FamilyDirectory.tsx): the
                    whole card is ONE link, and the dish names are
                    plain text, not links. That is the pattern this
                    site already established — the regions card was the
                    outlier.

                    The card is an <a>, and the dish names are text
                    inside it, so there is no nested anchor. */}
                <h2>{c.name}</h2>
                <span className="browse-dir-card__count">
                  {c.count} {c.count === 1 ? "dish" : "dishes"}
                </span>
              </div>
              {c.dishNames.length > 0 && (
                <p className="browse-dir-card__meta">
                  {c.dishNames.slice(0, 5).join(" · ")}
                  {c.count > 5 && ` · + ${c.count - 5} more`}
                </p>
              )}
              <span className="browse-dir-card__go">
                Open the dishes <span aria-hidden="true">→</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
