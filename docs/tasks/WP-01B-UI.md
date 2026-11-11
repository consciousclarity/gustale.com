# Task brief — WP-01b · the UI: the region filter and the heading (Claude Code)

## Context

Repo: `/home/alex/projects/gustale.com` (a geo-located dish and drink
encyclopedia). Branch: **`feature/wp-01-ui-claude`**, already pushed to
the remote and checked out from `origin/main` (`323eade`).

This is the UI half of WP-01 ("Browsing works"). The API half is done
separately by Codex on `feature/wp-01-api-coverage`. **Your work is the
web app only.**

Read these first, in this order:
- `docs/improvement-pack/tasks/WP-01-browsing-works.md` — the brief
- `docs/WP-01-WP-02-DISCOVERY.md` — WP-00's measured findings (trust
  these; they were measured against live)
- `docs/WP-00-REPORT.md` — how the site actually works

## The defect (already diagnosed — verify it, then fix it)

### Defect A — one line drops the filter

The API's region filter **works**. Measured live:
```
$ curl '…/api/dishes?limit=100&status=published&region=Indonesia'
total=193   origins=['Indonesia']
```

But `apps/web/src/components/DishExplorer.tsx:46-59` parses `region`
into state, renders a chip for it, and then **omits it from the request**:

```ts
function toListParams(state: BrowseQueryState, offset: number) {
  return {
    status: "published" as const,
    search: state.q || undefined,
    country: state.country ?? undefined,   // ← country is sent
    …
    // region is MISSING
```

`region` is parsed at `apps/web/src/lib/browse.ts:574` and chipped at
`:618-623`. It is dropped at the last step.

### Defect B — the static page ignores the query string

`/dishes` is a **static** page. The site is Astro in static mode: no
adapter in `astro.config.mjs`, and the Dockerfile copies `dist/` into
nginx. `apps/web/src/pages/dishes/index.astro:22` builds it with:

```ts
initial = await listDishes({ status: "published", limit: 24 });
```

There is no `Astro.url.searchParams` anywhere in that file. So
`https://gustale.com/dishes?region=Indonesia` serves **23 global dishes**
(measured) — banh-mi, bibimbap, biryani-hyderabadi… — not one Indonesian
dish, even though the API has 193.

**The brief's requirement is explicit: "The filtered list must work
without JavaScript."** A client-side fix alone does not satisfy it.

The brief's answer for a static site: *"generate
`/dishes/region/<country-slug>/` pages at build time. Keep `?region=`
working by redirecting to the path form."*

### Defect C — the heading says "Recipes"

`apps/web/src/pages/dishes/index.astro:51-57` — both the `<title>` and
the `<BrowseHeader title=...>` say "Recipes". The brief wants "Dishes" or
"All dishes". Line 48 also has a literal `"Recipes"` fallback in
`countLabel`.

## What to do

1. **Verify the diagnosis first.** Read the code and hit the live API
   and the live page. **If the diagnosis is wrong, stop and report.**

2. **Fix defect A** — send `region` in `toListParams`. Decide
   deliberately whether `region` maps to the API's `region` param or to
   `country` (both work and both return the same 193). The API accepts
   `region` and `country` with identical semantics
   (`apps/api/src/routes/dishes.ts:180-183`, `:244-246`).

3. **Fix defect B** — the filtered list must work with JavaScript
   disabled.

   **There is an open question you must NOT decide alone:** how many
   path pages to generate. There are **178 origins**, most with 1–2
   dishes, and WP-02's brief says *"Places lists all origins. Show '+ N
   more' instead of a silently truncated sample list."* Generating 178
   static pages is a real decision about the site's shape, not a
   technical detail.

   **Raise it in your report** with a recommendation and a count of how
   many origins have ≥ N dishes, so the owner can choose. Meanwhile
   implement the part that is not in question: **the redirect**
   (`?region=` → the path form) and **the path-based page template**.

   If the owner's answer is needed before you can finish, implement
   everything else, leave the page-generation count as the one open item,
   and say so clearly.

4. **Fix defect C** — "Dishes" or "All dishes", in the `<title>`, the
   `<BrowseHeader>`, and the `countLabel` fallback.

5. **The active-filter UI** the brief asks for: when a filter is
   active, the list shows a heading like "193 dishes from Indonesia" and
   a removable chip; clearing it returns to `/dishes`. **Check first**
   whether this already works for `country`/`category`/`technique` — the
   chips exist in `browse.ts`, so much of this may already be there. Do
   not rebuild what works; make `region` behave like the others.

6. **A neutral placeholder for a failed cover**, never a broken-image
   icon (the brief's WP-01b item).

7. **Run the checks:**
   ```bash
   pnpm --filter @gustale/web run typecheck
   node scripts/run-lint.mjs
   ```
   Then build both domains the way production does:
   ```bash
   PUBLIC_DOMAIN=recipes BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:recipes
   PUBLIC_DOMAIN=geo     BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:geo
   ```

8. **Commit** on `feature/wp-01-ui-claude`, then push:
   ```bash
   python3 scripts/hermes/push_sha_as_app.py origin feature/wp-01-ui-claude <your-verified-sha> <the-current-remote-sha>
   ```
   Get the remote sha with `git ls-remote origin refs/heads/feature/wp-01-ui-claude`.
   **Never force-push.**

## Rules — these are absolute

- **Do not touch `apps/api/`.** That is Codex's branch. Touching it here
  makes the branches conflict.
- **Do not touch the database.** No migrations, no writes to live.
- **Do not implement decisions D1, D2 or D3** — the language switcher,
  the banner, "Add a dish" → "Suggest a source or correction", and the
  Recipes nav link. Those are **WP-03**. The "Recipes" heading on the
  *dishes page* is WP-01 (defect C); the *nav link* is WP-03.
- **Do not implement WP-02** — the regions/families pages, the
  pagination helper, the count gate. Separate branch, separate package.
- **Do not fix the associations loader.** WP-00 proved it works; it only
  mounts on scroll (`client:visible`).
- **Do not deploy, and do not open a PR.** The owner decides both.
- **Never print a secret.**

## What to save

Write your findings to
`/home/alex/projects/gustale.com/docs/WP-01B-UI-REPORT.md` before you
finish, so the work survives an iteration limit. It must contain:
- your verification of each of the three defects
- what you changed, file by file
- **the open question about how many path pages to generate, with your
  recommendation and the supporting counts**
- the test/build output
- the commit sha you pushed
- anything you found that you did not fix, and why

## Completion criteria

- `?region=Indonesia` is sent to the API, and the chip works.
- The filtered list renders **without JavaScript** (or the one open item
  is clearly stated and everything else is done).
- The heading says "Dishes", not "Recipes".
- Typecheck and lint pass; both production builds succeed.
- The report file exists.
- The branch is pushed, as a fast-forward.

## Budget

Stop and report if the no-JS requirement turns out to conflict with the
Astro architecture in a way you cannot solve without a decision from the
owner. Do not widen the scope beyond WP-01b.
