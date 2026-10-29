/**
 * ADR-003 — the browser-language SUGGESTION.
 *
 * The ADR: "Browser language — **Suggest, not force.** A locale chooser
 * or a banner offers the detected locale; the page renders in English
 * unless the user chooses. No automatic redirect that hides content."
 *
 * So this NEVER redirects. It reads the browser's Accept-Language and,
 * if it names a locale the site has and the page is not already in,
 * it shows a dismissible banner offering that locale.
 *
 * A client component, because Accept-Language is a request header and
 * the site is statically built — the server never sees it.
 *
 * The offer is stored in localStorage once dismissed, so a visitor
 * who says "no" is not asked again on every page.
 */
import { useEffect, useState } from "react";

const STORAGE_KEY = "gustale.locale.suggestion.dismissed";

/** The locales the site ships pages in. */
const SITE_LOCALES = [
  "en",
  "es",
  "de",
  "fr",
  "pt",
  "id",
  "zh",
  "ja",
  "ar",
  "hi",
] as const;

type Locale = (typeof SITE_LOCALES)[number];

const NAMES: Record<string, string> = {
  en: "English",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  pt: "Português",
  id: "Bahasa Indonesia",
  zh: "中文",
  ja: "日本語",
  ar: "العربية",
  hi: "हिन्दी",
};

export interface LocaleSuggestionProps {
  /** The locale of the current page. */
  current: string;
  /** The URL of this page in each locale. */
  urls: Record<string, string>;
}

export function LocaleSuggestion({ current, urls }: LocaleSuggestionProps) {
  const [suggested, setSuggested] = useState<Locale | null>(null);

  useEffect(() => {
    if (current !== "en") return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      // A blocked localStorage (private mode) must not break the page.
    }

    // navigator.languages is the browser's own ordered preference, and
    // it is what the Accept-Language header is built from.
    const preferences = navigator.languages ?? [navigator.language];
    for (const tag of preferences) {
      const base = tag.toLowerCase().split("-")[0] ?? "";
      if (
        base &&
        base !== current &&
        (SITE_LOCALES as readonly string[]).includes(base) &&
        urls[base]
      ) {
        setSuggested(base as Locale);
        return;
      }
    }
  }, [current, urls]);

  if (!suggested) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, suggested);
    } catch {
      // Ignore — the banner simply comes back next time.
    }
    setSuggested(null);
  };

  return (
    <div className="gst-locale-suggest" role="status">
      <span className="gst-locale-suggest__text">
        This site is available in {NAMES[suggested] ?? suggested}.{" "}
        <a href={urls[suggested]} hrefLang={suggested}>
          View it in {NAMES[suggested] ?? suggested}
        </a>
        .
      </span>
      <button
        type="button"
        className="gst-locale-suggest__dismiss"
        onClick={dismiss}
        aria-label="Dismiss the language suggestion"
      >
        ×
      </button>
    </div>
  );
}
