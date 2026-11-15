/**
 * The credit of a photograph, as TEXT.
 *
 * The media row stores one free-text `credit` string with the URLs
 * embedded in parentheses:
 *
 *   "Michael Hays (https://www.flickr.com/photos/15154907@N06) — Flickr
 *    (https://www.flickr.com/photos/15154907@N06/1753760108) via
 *    Wikimedia Commons (https://commons.wikimedia.org/wiki/File%3A...)"
 *
 * Printing it verbatim put a 553px run of text into the caption of a
 * 390px viewport, and the page then scrolled sideways. The 2026-11-15
 * blueprint recorded that as "578 px content width from unbroken credit
 * URLs" and asked for "the source name as the link text instead of the
 * raw URL".
 *
 * So the URL is dropped and the NAMES are kept: "Michael Hays — Flickr
 * via Wikimedia Commons". The names are the attribution; the URL is
 * the pointer, and a pointer is not worth 400 pixels of a phone's
 * width.
 *
 * The rule is deliberately narrow:
 *
 *  - a parenthesised URL is removed whole, with its parentheses;
 *  - a bare URL is removed;
 *  - everything else is kept exactly as it was;
 *  - a credit with no URL at all comes back unchanged.
 */

/** A URL inside parentheses, with the parentheses. */
const PARENTHESISED_URL = /\s*\(\s*(?:https?:\/\/|www\.)[^)]*\)/gi;

/** A URL not inside parentheses. */
const BARE_URL = /\s*(?:https?:\/\/|www\.)\S+/gi;

/**
 * Remove the URLs from a credit string, keeping the names.
 *
 * @param credit The stored credit, possibly with URLs in it.
 * @returns The credit with its URLs removed and its names kept.
 */
export function stripUrls(credit: string): string {
  return (
    credit
      .replace(PARENTHESISED_URL, "")
      .replace(BARE_URL, "")
      // A dropped parenthetical leaves the separator dangling -- "Michael
      // Hays — via Wikimedia Commons" is right, but "Michael Hays — — via
      // Wikimedia Commons" is not. Collapse the runs of whitespace the
      // removals leave behind.
      .replace(/\s*—\s*(?=—)/g, " — ")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}
