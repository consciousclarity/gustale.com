# Item 5 — the recipe hub and the recipe page

The screenshots for item 5 of the recipes task: the two recipes routes on
`gustale.recipes`.

| file | what it shows |
|---|---|
| `hub-empty-desktop.png` | the HUB (`/dishes/moussaka-greek`) — the empty state, desktop |
| `hub-empty-mobile.png` | the HUB — the empty state, mobile |
| `hub-populated-desktop.png` | the HUB with recipes, desktop |
| `hub-populated-mobile.png` | the HUB with recipes, mobile |
| `recipe-notfound-desktop.png` | the RECIPE PAGE (`/recipes/<slug>`) for an unpublished slug — the 404, desktop |
| `recipe-notfound-mobile.png` | the RECIPE PAGE for an unpublished slug — the 404, mobile |
| `recipe-populated-desktop.png` | the RECIPE PAGE in full — title, times, confidence, ingredients, method, notes, desktop |
| `recipe-populated-mobile.png` | the RECIPE PAGE in full, mobile |

## Why there are two sets

**The empty set is the truth.** `recipe_published` has zero rows on
live, so every hub on the real site renders its empty state and every
`/recipes/<slug>` is a 404. The empty-state screenshots are what a
reader sees today, and the empty state is the deliverable at this
moment: "No recipe yet", a link to the Atlas, and `noindex`.

**The populated set is the proof.** A build that can only ever produce
the empty state cannot show that the recipe list, the filter island and
the recipe page itself render — and those are the parts that break
when a shape drifts. The populated screenshots are made against the
mock API's recipe fixture (`apps/web/scripts/mock-api-recipes.json`),
which is opt-in; the default mock returns the empty shape, exactly as
live does.

The `noindex` is DERIVED, not stored (ADR-007-A1 §5.2): the empty hub
carries it, the populated hub does not, and neither does the populated
recipe page. The two sets are the same code reading a different recipe
count.

## How to reproduce them

```bash
# 1. the mock API (the plain one serves the empty shape, like live)
node apps/web/scripts/mock-api.mjs --port 8742
node apps/web/scripts/mock-api.mjs --port 8743 --with-recipes

# 2. build each dist
PUBLIC_DOMAIN=recipes BUILD_DATA_SOURCE=mock PUBLIC_API_BASE=http://127.0.0.1:8742 \
  node apps/web/scripts/../node_modules/.bin/astro build   # → dist-item5-empty
PUBLIC_DOMAIN=recipes BUILD_DATA_SOURCE=mock PUBLIC_API_BASE=http://127.0.0.1:8743 \
  ...                                                      # → dist-item5-populated

# 3. serve each and capture
python3 scripts/hermes/serve-dist.py apps/web/dist-item5-empty 8899
python3 scripts/hermes/serve-dist.py apps/web/dist-item5-populated 8900

node scripts/hermes/item5-screenshots.cjs http://127.0.0.1:8899 docs/screenshots/item5 empty
node scripts/hermes/item5-screenshots.cjs http://127.0.0.1:8900 docs/screenshots/item5 populated
node scripts/hermes/item5-console-check.cjs http://127.0.0.1:8899 empty
node scripts/hermes/item5-console-check.cjs http://127.0.0.1:8900 populated
```

The screenshots are IN THE REPO rather than attached to the PR because
the GitHub App has no asset-upload scope: `gh` needs a PAT to upload a
PR asset, and the App cannot mint one.

## Two harness notes, so the pictures are not misread

**The blank cover frame.** The dish photos live on the object store
(MinIO), not in the repo, so the static server answers `/media/` with a
1×1 transparent PNG. In production nginx serves the real image. The
frame is bordered and sized correctly — there is simply no photo in the
repo to put in it.

**The `/api/auth/get-session` 404.** The `AuthMenu` island in the Nav
asks the API for the session on every page of both properties, and the
static server has no API behind it. `item5-console-check.cjs` proves it
is the harness and not the recipe pages by loading `/about` — a page
this change did not touch — and showing the same 404 there. The same
script also proves the check can fail, by pointing it at a URL that
does not exist and confirming it IS reported.
