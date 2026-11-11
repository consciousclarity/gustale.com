# WP-00 · Baseline and setup — the report

**Owner:** Hermes (gustale profile) · **Date:** 2026-11-11
**Branch:** `wp/00-baseline` · **Mode:** read-only, apart from `docs/` and `reports/`
**Status:** awaiting Alex's approval. No merge, no deploy, no database write.

---

## 1. Where everything really runs

### Repo path and host

The pack's memory said `/home/alex/workspace/gustale.com`. **That path does not
exist.** The real one:

```
$ hostname
GEEKOBOT
$ git rev-parse --show-toplevel
/home/alex/projects/gustale.com
$ git rev-parse --abbrev-ref HEAD
wp/00-baseline
```

Host is **GEEKOBOT**, a WSL2 Linux box (`6.18.58.1-microsoft-standard-WSL2`),
running as user `alex`. The `/home/gustale/...` paths in older notes refer to
**the VPS**, not this machine. This host is the *local* checkout; production
runs elsewhere.

### Git

```
$ git remote -v
origin  https://github.com/consciousclarity/gustale.com.git
$ git symbolic-ref refs/remotes/origin/HEAD
refs/remotes/origin/main          # default branch: main
```

**Worktrees (listed, not touched):**

```
$ git worktree list
/home/alex/projects/gustale.com                        af5f87c [wp/00-baseline]
/home/alex/projects/gustale.com/.worktrees/t_4dc80a38  bfbb897 [feat/recipes-item5-hub-and-page]
```

### Stack

| Layer | Technology | Evidence |
|---|---|---|
| Frontend | **Astro 7.4.4** + React 19 + Tailwind 4, MapLibre GL 6 | `apps/web/package.json` |
| API | **Fastify 5.12** + better-auth 1.7 + Zod 4 | `apps/api/package.json` |
| Database | **PostgreSQL 16 + PostGIS 3.4**, Drizzle ORM 0.45 | `packages/db/package.json`, `apps/api/Dockerfile` |
| Media store | **MinIO 8** | `apps/api/package.json` |
| Runtime | Node 22.23.4, pnpm 11.8 | `package.json`, `.nvmrc` |

The database itself runs on the VPS in the `shared-postgres` container, not
here. This host reaches it only over the network.

### Static or server-rendered?

**Static (SSG).** `apps/web/astro.config.mjs` has **no `output` setting and no
adapter** — so Astro's default `static` applies. There is no
`@astrojs/node` dependency. The Dockerfile copies `dist/` into `nginx:1.27-alpine`
and serves it:

```dockerfile
COPY --from=builder /app/apps/web/dist/ /usr/share/nginx/html/
```

**Mixed in practice:** the *page shells* are static HTML, but the interactive
parts are React islands that fetch `/api/*` at runtime. So a page can be
stale (baked at build time) while its island shows live data.

### Does the build read live data or mock data?

**Both, and the distinction matters.** `apps/web/Dockerfile` takes a
`BUILD_DATA_SOURCE` build arg:

- `mock` (the default) — starts an in-container mock on `:8742` from the
  committed seed (`apps/web/scripts/mock-api.mjs`, 34 KB).
- `live` — fetches from `PUBLIC_API_BASE`.

**The production deploy uses `live`.** `.github/workflows/ci.yml` (deploy job,
line ~1683) runs on the VPS:

```bash
( cd "$BUILD_DIR" && GUSTALE_NO_PUSH=1 GUSTALE_WEB_LIVE_TAG_FILE="$TAG_FILE" \
    ./scripts/hermes/build-web-live.sh "$SHA" )
```

and `scripts/hermes/build-web-live.sh` builds with
`--build-arg BUILD_DATA_SOURCE=live --build-arg PUBLIC_API_BASE=http://127.0.0.1:4000`.

The comment in that script explains why: *"GHA cannot reach the VPS API through
the firewall, so the GHA build uses an in-container mock."* **The GHA
`build-web` job does use the mock — but that image is not what production
serves.** The deploy builds a second, live-data image on the VPS.

**So the pack's hypothesis ("CI could not reach the live API and built from
mock data") is NOT the cause of the stale Places and Families counts.** The
production site is built from live data. I found the real cause below — and it
is a code bug, not a build-configuration bug.

### Build and deploy path

```
push to main  →  CI (lint → test → build → build-web → deploy)
                                   ↘ build-web: GHA, mock data, image to ghcr
                                   ↘ deploy: SSH to the VPS
                                             1. swap the API container
                                             2. build-web-live.sh on the VPS (live data, GUSTALE_NO_PUSH=1)
                                             3. swap both web containers (geo + recipes)
                                             4. verify
```

The deploy job has `timeout-minutes: 75` and its own concurrency group
`deploy-hostinger` with `cancel-in-progress: false` — a second deploy queues
rather than interleaving.

**Rollback:** there is **no automated rollback**. The CI file says
*"build-web-live.sh failed; gustale-api already swapped (**rollback path needed**)"*
— i.e. the workflow acknowledges the gap but does not close it. The rollback is
manual: redeploy the previous commit (each web image carries a
`live-data-<short-sha>-<variant>` tag, and the API is image-pinned per SHA).
This is a real risk for the improvement pack and should be an explicit task.

### Staging environment

**There is none.** No staging URL, no staging branch, no staging deploy job.
`grep -n "staging" .github/workflows/ci.yml` returns nothing.

**Consequence for the improvement pack:** the OPERATING-MODEL's flow step 4
("Local checks … the smoke test against a local or staging URL (`--base`)")
has no staging to point at. The smoke test only really runs against
production. That makes the pack's own workflow safer (green on production is
the definition of done) but riskier (a bad change is discovered in production,
not before). This is worth a decision from Alex — see §5.

---

## 2. The smoke test is installed and working

- `scripts/smoke/gustale-smoke.mjs` — the pack's script, in the repo.
- `scripts/smoke/fetch-browser-libs.sh` — fetches `libnspr4` + `libnss3`.
- `scripts/smoke/run-smoke.sh` — the entry point; sets `LD_LIBRARY_PATH` and runs.

**Why the extra scripts exist.** Playwright's Chromium needs `libnspr4` and
`libnss3`. This host has neither, and `sudo` needs a password, so they cannot
be installed system-wide. `fetch-browser-libs.sh` downloads the two Ubuntu
`.deb` packages, extracts them with `dpkg-deb` into
`scripts/smoke/.browser-libs/` (gitignored, inside the repo so it survives a
`/tmp` wipe), and `run-smoke.sh` points `LD_LIBRARY_PATH` at them for the
smoke run only. **Nothing is installed system-wide and nothing is escalated.**

Playwright 1.64.1 was already in the repo's `node_modules`, with Chromium
installed at `~/.cache/ms-playwright/chromium-1248`. Verified from a clean
state: with both `/tmp` and the repo's library directory deleted, one
`scripts/smoke/run-smoke.sh --wp WP-01` run downloaded, extracted, and executed
every browser check successfully.

### Two fixes to the smoke script itself

Both are **fixes to the test, not to the site.** Each was diagnosed by
measurement, and each is documented in the script.

**Fix 1 — `networkidle` → `domcontentloaded` (3 call sites).**
`networkidle` never settles on these pages: the MapLibre map keeps connections
open, so every browser check timed out at 60 s and the script exited 2
("Smoke test crashed") before recording anything.

**Fix 2 — wait for content, not for a fixed number of milliseconds.**
Three browser checks were sampling a transient state. The home page's Places
section renders an empty state (`"No dish in the catalogue has a location
yet."`) while the island fetches, then replaces it with the real list.
Measured on 2026-11-11, sampling the same URL repeatedly:

| wait after load | empty state present | the check would report |
|---|---|---|
| 0 ms | no | PASS |
| 1 000 ms | **yes** | FAIL |
| 3 000 ms | **yes** | FAIL |
| 6 000 ms | no | PASS |
| 12 000 ms | no | PASS |

The pack's fixed `waitForTimeout(3000)` therefore lands *exactly* on the
transient and reports a FAIL that is not true of the site. The script now
waits for the DOM to stop changing **and** for the content to exist
(`.places-list`), which is the signal that actually matters.

**Fix 3 — scroll the page before checking for stuck loaders.**
This one is the more interesting finding. The dish page's `<AtlasPlaces>`
island is rendered with Astro's `client:visible` directive
(`apps/web/src/pages/dishes/[slug].astro:199`), so it **only mounts when it
scrolls into view**. A headless check that never scrolls sees the
server-rendered fallback forever. Measured:

| | stuck loader | request to `/api/dishes/rendang/atlas` |
|---|---|---|
| before scrolling | **present** | **never made** |
| after scrolling into view | gone | `200` |

After the scroll the section resolves to *"No association has been published
for this dish yet. Associated with Indonesia · ID — This is a discovery
value, not a reviewed historical claim."* The loader is not stuck; the island
had simply never been hydrated. The script now scrolls the page
(`hydrateVisibleIslands`) before checking.

---

## 3. The baseline

`reports/smoke-baseline.json` — **24 FAIL · 7 PASS · 1 WARN** across all 32
checks, against `https://gustale.com`.

### Against the pack's baseline

The pack's `scripts/baseline-2026-11-11.json` says **25 FAIL · 6 PASS · 1 WARN**
across the same 32 checks. A check-by-check comparison:

```
pack checks: 32   mine: 32      (no check missing, no check extra)
differences: 1
  WP-01  no-stuck-loaders /dishes/rendang   pack=FAIL  ->  mine=PASS
```

**The one difference is the pack's check being wrong, not the site.** The
`client:visible` finding above explains it: Claude's run recorded the
server-rendered loading fallback because nothing scrolled the page into view.

**Two consecutive runs produce identical results** (24/7/1, zero differing
checks), so the baseline is deterministic after the fixes — not a lucky sample.

### The failures, grouped

| WP | Failing checks | What is actually wrong |
|---|---|---|
| **WP-01** | region-filter-works, dish-list-heading, featured-cover-files, home-images-render, home-http-errors | The featured-cover path bug (below); `/dishes` H1 says "Recipes"; the region filter returns 24 dishes of which 1 is Indonesian |
| **WP-02** | places-country-count, places-indonesia-count, family-counts-agree, places-stat, sitemap-lineage-count | The `limit: 100` bug (below); `/api/places` is empty; the sitemap lists 12 lineages where the API has 14 |
| **WP-03** | stubs-hidden ×3, no-dead-add-dish-link, no-half-translations | Empty Preparation sections; "Contributors 0"; the dead "Add a dish" link; the half-translated Spanish page |
| **WP-04** | correction-link | No "Suggest a source or correction" link on unevidenced dish pages |
| **WP-06** | taxonomy-coverage | family 8.2%, method 8.2% of 1 474 dishes (target ≥95%) |
| **WP-09** | lineage-plural, lineage-empty, dish-links-lineage, confidence-defined | "1 dishes"; empty lineages listed; dishes not linked to a lineage; confidence levels undefined |
| **WP-10** | duplicate-names, view-counts-plausible | 10 duplicated names; lowest view count 1 812 (seeded-looking) |

**The one WARN:** `WP-10 covers` — 136 dishes without a cover image. The pack's
roadmap says a WARN on covers is acceptable for WP-10.

---

## 4. What the pack got wrong, and what I found instead

WP-00 asks for anything in the pack that contradicts what I found. Two things.

### 4a. The Places/Families root cause is a code bug, not a build-configuration bug

The pack's README says:

> *"Places and Families out of date (36 vs 178 countries, 22 vs '123'
> families): most likely the same problem recorded earlier for Gustale, where
> CI could not reach the live API through the VPS firewall and built from mock
> data. WP-02 verifies this before changing anything."*

**That hypothesis does not hold.** The production deploy builds with
`BUILD_DATA_SOURCE=live` against the live API on the VPS — I traced it through
`ci.yml` → `build-web-live.sh` → the Dockerfile's `live` branch. The site is
not mock-built.

The real cause is in the page code:

```astro
<!-- apps/web/src/pages/regions.astro:26 -->
initial = await listDishes({ status: "published", limit: 100 });
...
const countries = buildCountryDirectory(initial.dishes);
```

```astro
<!-- apps/web/src/pages/families.astro:22 -->
initial = await listDishes({ status: "published", limit: 100 });
```

`buildCountryDirectory` groups by `originName` (`apps/web/src/lib/browse.ts:505`),
so **the directory can never contain more countries than the first 100 dishes
happen to cover.** The live API has 1 474 dishes across **178** distinct
origins; the page shows **36**. The families page has the identical `limit:
100` and shows 22 families where the API reports 123.

**This is a one-line fix in each page, not a pipeline change** — but it is
WP-02's work, not WP-00's, so I have changed nothing. WP-02's brief says
"verify this before changing anything"; this is the verification.

### 4b. The home-page cover bug is real, but the pack describes it imprecisely

The README says `/api/dishes/featured` returns cover paths with *"no `/media/`
prefix and no leading slash"*, while `/api/dishes` returns `/media/dishes/...`.

Measured on live today:

| endpoint | `variantsUrls["800"]` | `publicUrl` |
|---|---|---|
| `/api/dishes/featured` | `dishes/moussaka-greek/cover-800w.webp` ← **no prefix** | `/media/dishes/moussaka-greek/cover-1536w.webp` ✓ |
| `/api/dishes` | `/media/dishes/moussaka-greek/cover-800w.webp` ✓ | `/media/dishes/.../cover-1536w.webp` ✓ |

So the bug is **in the `variantsUrls` map only**, and `publicUrl` is correct.
The `featured` route and the `dishes` route build their variant URLs
differently. Confirmed 12/12 featured dishes carry the unprefixed variant, and
all 12 render broken on the live homepage (`home-images-render`: *"12 broken"*;
`home-http-errors`: eight of them listed as 404s).

The relative URL resolves against the page, so the browser asks for
`https://gustale.com/dishes/moussaka-greek/cover-800w.webp` → 404. The fix is
still one line in the `featured` route; the diagnosis just needs to name the
right field.

### 4c. One thing the pack's numbers get right, and that I confirmed

- `places-stat`: `/api/atlas/counts` reports `places: 0` and
  `/api/places` returns `{"places":[],"count":0}`, while the data holds 178
  origins. **Why:** `places` are counted from *coordinate* associations, and
  only **121 of 1 474** dishes have coordinates (`/api/dishes/map?limit=2000`
  returns 121). The home page's Places section is correctly limited to those
  121 — it renders **36 distinct places** once loaded. So "places = 0" is not
  a bug in the count; it is a count of the *located* subset, against a
  directory page that counts *origins*. The two numbers are measuring different
  things, and the site's own copy should say which is which.

### 4d. One place where the site is *better* than the pack's baseline says

`no-stuck-loaders /family/dumpling/` is **PASS** in both runs, and
`no-stuck-loaders /dishes/rendang` is a false FAIL in the pack's baseline —
so the pack has one false FAIL and one true PASS, netting to the same totals
by accident.

---

## 5. D4 — the analytics proposal (proposal only; nothing installed)

**Recommendation: self-hosted Umami on the VPS, exactly as the pack
proposes.** I agree with the pack's choice and here is the detail it asks for.

| | |
|---|---|
| **Tool** | Umami v3 (Postgres-backed), self-hosted |
| **Host** | The same VPS as the API and the web containers — a fourth container on the existing `docker-compose.yml` |
| **Effort** | **0.5 day** (as the roadmap says): 2 h to stand up the container and the schema, 2 h to add the tracker snippet and the event calls, 2 h to verify events arrive and to wire the "analytics" card in `ROADMAP.md` |
| **Privacy** | No cookies, no fingerprinting, no third-party requests, no data leaving the VPS. This matters for an AGPL project that publishes under CC BY-SA and states its sourcing policy |
| **What it must answer** | The pack's requirement: *"Events visible for page views, search, filter clicks"* — so four events: `page_view` (with the dish/place/family slug), `search` (the query, trimmed), `filter_click` (the filter name and value), and `dish_impression` |
| **The data we already have** | The site's own `viewCount` field is **seeded** (the lowest across all 1 474 dishes is 1 812, and the highest is 2 900 — a 1 000-wide band around 2 000 that no real traffic produces). This is D1, and it is why real analytics matter: without them the site has no usage signal at all |
| **Guardrail** | D4 is a decision for Alex. **Nothing is installed** as part of WP-00. The card `GUS-1112`'s sibling — the analytics line in `ROADMAP.md` — stays a proposal |

**One caution.** Umami on the same host as the API adds a fourth service to a
host that already runs the API, two web containers, Postgres and MinIO. If
Alex prefers not to add a service, the alternative is a 20-line endpoint in
the existing Fastify API writing to the existing Postgres — less capable, no
dashboard, but no new container and no new port. I recommend Umami because the
pack's stated need ("events visible") implies a dashboard, but the fallback is
genuinely cheap and I would not argue hard against it.

---

## 6. What was set up

**In the repo, branch `wp/00-baseline`:**

- `docs/improvement-pack/` — all 17 files of the pack, extracted as received.
- `scripts/smoke/gustale-smoke.mjs` — the pack's smoke test, with the three
  fixes above.
- `scripts/smoke/fetch-browser-libs.sh`, `scripts/smoke/run-smoke.sh` — the
  no-root browser-library setup and the entry point.
- `reports/smoke-baseline.json` — the recorded baseline.
- `docs/WP-00-REPORT.md` — this report.

**In the private state repo** (`consciousclarity/gustale-state`, branch `state`):

- `BACKLOG.yaml` — **11 new cards, GUS-1111 … GUS-1121**, one per work
  package, under `EPIC 21 — The Gustale improvement pack (Phase 1 and 2)`,
  with the roadmap's dependencies and `approval: true` on the four packages
  that need one (WP-03, WP-05, WP-08, WP-10).
- `KANBAN.md` — regenerated from the backlog by `scripts/build_kanban.py`
  (271 tasks). The board is a generated view; the backlog is the state.
- `STATUS.md` — a "Gustale improvement" section linking to the pack, the
  board range, the baseline and the commands to run the smoke test.

**Nothing else was touched.** No application code, no schema, no migration, no
live database, no deploy, no merge. No production configuration changed.

---

## 7. What I need from Alex

1. **"WP-00 approved"** — then the branch can be merged (on your word; I will
   not merge).
2. **Three decisions I could not make myself:**
   - **Staging.** The pack's flow assumes one and there is none. Either accept
     that every change is discovered on production, or add a staging slot.
     I recommend accepting it for now: the smoke test is read-only, and the
     blast radius of a bad build is one deploy.
   - **Rollback.** The deploy has no automatic rollback and its own error
     message admits the gap. Should that become a work package? I recommend
     yes — it is cheap and it is what makes the pack's "low risk" claims true.
   - **D1–D3 and D5–D6** are needed before WP-03, WP-05 and WP-08 can start.
     D4 (analytics) is in §5 above.
3. **A note on the pack's WP-02 brief:** it says to verify the stale-counts
   cause before changing anything. §4a above *is* that verification, and the
   answer is a `limit: 100` in two Astro pages — not a pipeline problem. WP-02
   should start from that, not from the mock-data hypothesis.

**Recommended order:** WP-01 → WP-02 → WP-03, as the roadmap says. WP-01 and
WP-02 are both small, both have live-verified root causes, and together they
fix the two things a first-time visitor notices first: broken images and an
empty-looking Places page.
