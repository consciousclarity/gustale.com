# PR 5 — Server-rendered dish associations, and page-language alt text

> **Status: scoped, NOT started.** PR 5 needs no approval to *begin*:
> §7.3 of the redesign proposal already decides what it must do
> ("publish nothing now", "a server-rendered empty state, with no
> 'Loading…' text"). What it must NOT do is publish associations or
> apply the review migration — and it must not.

---

## What PR 5 is

Two defects on the dish page, both measured on the built site:

1. **The "Places & traditions" section is a client-fetched island.** The
   built HTML contains `Loading the associations for …` instead of the
   associations. A crawler, a JS-disabled reader, or a slow phone
   sees a loading message where the content should be.
2. **The cover image's alt text is English-only**, on a site whose
   dish pages are published per-locale.

PR 5 fixes both, and **publishes no associations**.

---

## Measured defects (built site, 2026-11-06)

### A. The associations are not in the HTML

`apps/web/dist/dishes/moussaka-greek/index.html` (42,347 bytes), read
directly:

| marker | count |
|---|---|
| `Places &amp; traditions` | 1 |
| **`Loading the associations for `** | **1** |
| `atlas-places` | 5 |
| `astro-island` | 25 |

The heading ships. The content does not. The section renders its
**loading** branch on first byte and only fills in after the client
fetches `/api/dishes/:slug/atlas`.

The cause is in `apps/web/src/components/AtlasPlaces.tsx`:

```tsx
const [data, setData] = useState<AtlasResponse | null>(null);
const [state, setState] = useState<"loading" | "ready" | "error">("loading");

useEffect(() => {
  setState("loading");
  getDishAtlas(slug)
    .then((res) => { setData(res); setState("ready"); })
    …
}, [slug]);

if (state === "loading") {
  return (… <p className="sub">Loading the associations for {dishName}…</p>);
}
```

and in `apps/web/src/pages/dishes/[slug].astro`:

```astro
<AtlasPlaces slug={data.dish.slug} dishName={data.dish.name} client:visible />
```

`client:visible` means the island does not even hydrate until it
scrolls into view.

### B. The alt text does not follow the page language

`apps/web/src/components/DishCoverHero.tsx:45`:

```tsx
const alt = cover?.altText ?? `${dishName} — cover`;
```

`cover.altText` is a **stored string on the media row** — one value per
media, not one per locale. The fallback is also English ("— cover").

The dish page publishes per-locale (`locale="en"` at
`apps/web/src/pages/dishes/[slug].astro:157`, with `hreflangAlternates`
and `SITE_LOCALES`), so on a non-English locale the alt text reads in
the wrong language.

The built English page shows the stored value:

```html
<img src="/media/dishes/moussaka-greek/cover-1536w.webp"
     alt="Greek moussaka in a baking dish, golden béchamel topping visible over layered aubergine"
     class="dish-cover-hero__img" …>
```

---

## The fixes

### 1. Server-render the associations

The dish page is **already static** and already fetches at build time
(`getStaticPaths` walks every published dish; the page body fetches
`getDishDetail`). The associations can use the same path.

- Fetch the atlas view **at build time** in `getStaticPaths` (or in
  the page frontmatter), keyed by slug, alongside the existing dish
  fetch.
- Pass the data **into** `AtlasPlaces` as a prop; the component stops
  fetching and stops owning a loading state.
- Render the **real** section in the built HTML: the heading, the
  grouped associations, and the legacy/discovery-data marker.
- Keep the **empty state** explicit and server-rendered: when a dish
  has no associations, the section says so — no "Loading…", no spinner,
  no silent absence.
- `client:visible` is no longer needed for the content. The component
  may stay hydrated if it has interactive parts, but the **content must
  be in the HTML**.

**API shape.** `GET /api/dishes/:slug/atlas` already exists
(`apps/api/src/routes/atlas.ts:44`) and already returns the
`placesAndTraditions` grouping plus the `legacy.origin` discovery
marker. **No API change is required** — the same response is read at
build time instead of in the browser.

### 2. Alt text in the page language

The alt text must be produced **for the locale being rendered**, not
read from a single stored English string.

- Prefer a **per-locale alt text** if the media row can carry one.
- Otherwise, build the alt from the page's own localized fields
  (`dish.name` in the page locale, the localized origin) so the
  fallback is in the right language instead of the literal
  `" — cover"`.
- The stored `cover.altText` remains the last resort for a locale with
  no localized dish name — but the English fallback string `"— cover"`
  must not be emitted on a non-English page.

---

## What PR 5 must NOT do

- **Publish no associations.** The association data stays as it is.
- **Do not apply the review migration** (0049-adjacent). That is
  PR 186's approval, and it is not part of this PR.
- **Do not change the API response shape** for the atlas endpoint.
- **Do not touch the `/browse` or Startpage** surfaces.

---

## Verification

### 1. The built HTML contains the associations, not a loading message

A script that reads the built `dist/dishes/*/index.html` and asserts:

| assertion | how |
|---|---|
| no loading text | `Loading the associations` appears in **zero** built dish pages |
| the section is present | the association markup is in the HTML for dishes that have associations |
| the empty state is server-rendered | dishes with no associations render an explicit empty state, also in the HTML |

This is a **DOM check on the built artifact** — the same evidence
standard as the PR 3 and PR 4 proofs.

### 2. The gate can fail

A check that matches nothing reports zero. Before trusting
"0 loading messages", the checker must be shown to **fail** when the
page does contain a loading message. Same discipline as
`scripts/hermes/pr4-plural-selftest.cjs`.

### 3. Alt text follows the page language

- For each built locale page, the `<img alt>` must be in that locale's
  language — no English `"— cover"` on a non-English page.
- The alt must not be empty.

### 4. No regression

- `pnpm lint` → 0 errors.
- `pnpm run typecheck` → clean.
- The API suite → 19 files / 186 passed / 3 skipped.
- The web build → the same page count as before the change.
- axe on the dish page, desktop and mobile.

---

## Sequencing note

PR 5 is **independent of PR 3 and PR 4** — it touches the dish page,
not the Startpage or the API's list filters. It can be branched from
`main` and opened alongside them, rather than stacked. That keeps the
review independent and avoids the CI problem a stacked PR creates
(both workflows trigger on `pull_request: branches: [main]` only).

---

## Still open, and not part of this PR

- The **association review migration** (Option A/B/C) — awaiting
  Alejandro's approval, in PR 186.
- The **50-row pilot** — awaiting the same approval.
- Publishing associations at all — not until the review exists.
