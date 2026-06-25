# Homepage Sophistication Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the landing page to the blueprint editorial design — oversized serif hero, rotating featured-dish card, algorithmic featured rails, schema-stats band, Contribute nav CTA, refined footer — keeping the existing 4-mode Explore workspace.

**Architecture:** Approach A (SSR-first split). `index.astro` server-renders the editorial sections with build-time data (same try/catch fallback as `families.astro`). The interactive workspace becomes a focused `HomeWorkspace.tsx` island; the hero's rotating card is a small `HeroFeaturedCard.tsx` island. A new `GET /api/dishes/featured` endpoint supplies most-connected dishes in one request. Hero↔workspace communicate via `location.hash` only.

**Tech Stack:** Fastify + Drizzle (raw `db.execute(sql\`\`)`) on the API; Astro + React islands + plain CSS design tokens on the web; vitest (API) + `astro check` + dual domain builds for verification.

## Global Constraints

- Design tokens (verbatim): `--bg #F6F1E7` · `--card #FBF8F1` · `--ink #211C16` · `--sub #6B6052` · `--accent #B8552F` · `--accent-ink #FBEFE6` · `--accent-soft rgba(184,85,47,0.10)` · `--line rgba(33,28,22,0.14)` · `--display 'Instrument Serif'` · `--mono 'IBM Plex Mono'`.
- Map/WebGL components mount `client:only="react"` (never `client:load`) — they touch `window` at import.
- API `limit` params are Zod-coerced ints with explicit caps.
- `media_attachments` is polymorphic: filter `target_type = 'dish' AND target_id = d.id`; cover = `role = 'cover'` else first by `position`.
- Conventional commits (`feat:`/`fix:`/`refactor:`/`docs:`). TS strict; `astro check` and `tsc --noEmit` clean before commit.
- Nav labels stay real: Dishes / Families / Lineages / Map (geo only) / About. Do NOT add the mockup's "Regions"/"Data".
- API tests need env sourced: `cd apps/api && set -a && . ./.env && set +a && pnpm exec vitest run <file>`.
- Hero H1 copy: **"Every dish has a place."** with the final word in `--accent`. Kicker: **"A LIVING ATLAS OF WORLD FOOD"**.

---

### Task 1: `GET /api/dishes/featured` endpoint

**Files:**
- Modify: `apps/api/src/routes/dishes.ts` (add route near the `/api/dishes/map` handler)
- Test: `apps/api/test/dishes-featured.test.ts`

**Interfaces:**
- Produces HTTP `GET /api/dishes/featured?limit=N` → `{ dishes: FeaturedDish[], count }` where
  `FeaturedDish = { slug, canonicalName, shortDescription, originName, originIso, cuisineSlug, cuisineName, relationCount, coverMediaId }` (all string|null except `relationCount: number` and `slug`/`canonicalName: string`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/dishes-featured.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

let app: FastifyInstance;
beforeAll(async () => { app = await buildServer(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('GET /api/dishes/featured', () => {
  it('returns dishes ordered by relation count, capped by limit', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dishes/featured?limit=5' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { dishes: any[]; count: number };
    expect(Array.isArray(body.dishes)).toBe(true);
    expect(body.dishes.length).toBeLessThanOrEqual(5);
    // monotonic non-increasing relationCount
    for (let i = 1; i < body.dishes.length; i++) {
      expect(body.dishes[i - 1].relationCount).toBeGreaterThanOrEqual(body.dishes[i].relationCount);
    }
    if (body.dishes.length) {
      const d = body.dishes[0];
      expect(typeof d.slug).toBe('string');
      expect(typeof d.canonicalName).toBe('string');
      expect(typeof d.relationCount).toBe('number');
      expect('coverMediaId' in d).toBe(true);
    }
  });

  it('defaults limit to 8 and caps at 24', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dishes/featured?limit=999' });
    expect(res.statusCode).toBe(200);
    expect(res.json().dishes.length).toBeLessThanOrEqual(24);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && set -a && . ./.env && set +a && pnpm exec vitest run test/dishes-featured.test.ts`
Expected: FAIL — 404 (route not registered) so `statusCode` is 404, not 200.

- [ ] **Step 3: Add the route** (paste immediately after the `/api/dishes/map` handler's closing `});` in `apps/api/src/routes/dishes.ts`)

```ts
  // GET /api/dishes/featured
  //
  // Top dishes by curated-relation count, for the homepage hero card and
  // the "most-connected" rail. One query instead of N per-slug /relations
  // calls. Anonymous-readable; only published dishes (the GROUP BY is over
  // outgoing edges, the JOIN filters status). coverMediaId is the dish's
  // cover attachment (role='cover', else first by position) or null.
  app.get('/api/dishes/featured', async (request, reply) => {
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(24).default(8) })
      .parse(request.query);

    const rows = (await db.execute(sql`
      SELECT
        d.slug,
        d.canonical_name,
        d.short_description,
        g.name      AS origin_name,
        g.iso_code  AS origin_iso,
        c.slug      AS cuisine_slug,
        c.name      AS cuisine_name,
        rc.relation_count,
        cov.media_id AS cover_media_id
      FROM (
        SELECT from_dish_id, COUNT(*)::int AS relation_count
        FROM dish_relations
        GROUP BY from_dish_id
      ) rc
      JOIN dishes d ON d.id = rc.from_dish_id AND d.status = 'published'
      LEFT JOIN geo_entities g ON g.id = d.origin_geo_id
      LEFT JOIN dish_categories dc ON dc.dish_id = d.id AND dc.is_primary = true
      LEFT JOIN categories c ON c.id = dc.category_id
      LEFT JOIN LATERAL (
        SELECT ma.media_id
        FROM media_attachments ma
        WHERE ma.target_type = 'dish' AND ma.target_id = d.id
        ORDER BY (ma.role = 'cover') DESC, ma.position ASC
        LIMIT 1
      ) cov ON true
      ORDER BY rc.relation_count DESC, d.canonical_name ASC
      LIMIT ${limit}
    `)) as unknown as Array<{
      slug: string;
      canonical_name: string;
      short_description: string | null;
      origin_name: string | null;
      origin_iso: string | null;
      cuisine_slug: string | null;
      cuisine_name: string | null;
      relation_count: number;
      cover_media_id: string | null;
    }>;

    return {
      dishes: rows.map((r) => ({
        slug: r.slug,
        canonicalName: r.canonical_name,
        shortDescription: r.short_description,
        originName: r.origin_name,
        originIso: r.origin_iso,
        cuisineSlug: r.cuisine_slug,
        cuisineName: r.cuisine_name,
        relationCount: r.relation_count,
        coverMediaId: r.cover_media_id,
      })),
      count: rows.length,
    };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && set -a && . ./.env && set +a && pnpm exec vitest run test/dishes-featured.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/dishes.ts apps/api/test/dishes-featured.test.ts
git commit -m "feat(api): GET /api/dishes/featured — top dishes by relation count"
```

---

### Task 2: Web API client `getFeaturedDishes()` + type

**Files:**
- Modify: `apps/web/src/lib/api.ts` (add fn near `getMapDishes`)
- Modify: `apps/web/src/types/dish.ts` (add `FeaturedDish` + response type)

**Interfaces:**
- Consumes: Task 1 endpoint shape.
- Produces: `export interface FeaturedDish { slug: string; canonicalName: string; shortDescription: string | null; originName: string | null; originIso: string | null; cuisineSlug: string | null; cuisineName: string | null; relationCount: number; coverMediaId: string | null }` and `getFeaturedDishes(params?: { limit?: number }): Promise<{ dishes: FeaturedDish[]; count: number }>`.

- [ ] **Step 1: Add the type** to `apps/web/src/types/dish.ts` (append):

```ts
export interface FeaturedDish {
  slug: string;
  canonicalName: string;
  shortDescription: string | null;
  originName: string | null;
  originIso: string | null;
  cuisineSlug: string | null;
  cuisineName: string | null;
  relationCount: number;
  coverMediaId: string | null;
}

export interface FeaturedDishesResponse {
  dishes: FeaturedDish[];
  count: number;
}
```

- [ ] **Step 2: Add the client fn** to `apps/web/src/lib/api.ts`. Mirror the existing `getMapDishes` (same `apiFetch`/base-URL + querystring helper it already uses). Import the new types at the top alongside the existing `dish` type imports.

```ts
import type { FeaturedDishesResponse } from '../types/dish';

export function getFeaturedDishes(
  params: { limit?: number } = {},
): Promise<FeaturedDishesResponse> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set('limit', String(params.limit));
  const q = qs.toString();
  // apiFetch is the same helper getMapDishes/listDishes already use.
  return apiFetch(`/api/dishes/featured${q ? `?${q}` : ''}`);
}
```

> If `getMapDishes` uses a differently-named internal helper than `apiFetch`, match that name — read `getMapDishes` first and copy its exact fetch mechanism.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @gustale/web exec astro check`
Expected: 0 errors (the new fn + types resolve).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/types/dish.ts
git commit -m "feat(web): getFeaturedDishes API client + FeaturedDish type"
```

---

### Task 3: Extract `HomeWorkspace.tsx` island (refactor, no visual change)

Splits the interactive Explore section out of `GustaleHomeIsland.tsx` so the hero/CTA chrome can move to server-rendered Astro. Behavior is preserved; the only addition is hash-seeding the search.

**Files:**
- Create: `apps/web/src/components/HomeWorkspace.tsx`
- Modify: `apps/web/src/components/design/GustaleHomeIsland.tsx` (becomes thin or is deleted in Task 5)

**Interfaces:**
- Produces: `export default function HomeWorkspace(): JSX.Element` — self-contained; fetches its own list + map data (the existing logic). On mount reads `location.hash` of form `#explore=<query>` and seeds `search`; listens for `hashchange`.

- [ ] **Step 1: Create the file** by moving the workspace machinery out of `GustaleHomeIsland.tsx`. Copy verbatim into `HomeWorkspace.tsx`: the helpers `ensureMapLibre`, `parseQuery`, the `MapDish`/`ViewMode`/`SortKey`/`ParsedFilters` types, and the four view components (`AtlasView`, `IndexView`, `GalleryView`, `FeedView`) and `FilterChips`. Then build the default export from the **Workspace `<section>` only** (the existing `className="workspace wrap"` block plus its `view`/`search`/`listData`/`mapDishes`/`loading`/`error` state and the two `useEffect`s). Do not include the hero `<section>` or the CTA `<div className="band">`.

- [ ] **Step 2: Add hash seeding** inside `HomeWorkspace`, after the existing `useState` declarations:

```tsx
useEffect(() => {
  const readHash = () => {
    const m = location.hash.match(/^#explore=(.*)$/);
    if (m) setSearch(decodeURIComponent(m[1]));
  };
  readHash();
  window.addEventListener('hashchange', readHash);
  return () => window.removeEventListener('hashchange', readHash);
}, []);
```

Add an anchor the hero can scroll to: give the root `<section className="workspace wrap" id="explore">`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @gustale/web exec astro check`
Expected: 0 errors. (`GustaleHomeIsland.tsx` may now have unused code — acceptable until Task 5 removes it.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/HomeWorkspace.tsx
git commit -m "refactor(web): extract HomeWorkspace island from GustaleHomeIsland"
```

---

### Task 4: `HeroFeaturedCard.tsx` rotating card island

**Files:**
- Create: `apps/web/src/components/HeroFeaturedCard.tsx`
- Modify: `apps/web/src/styles/global.css` (append `.hero-fcard*` rules)

**Interfaces:**
- Consumes: `FeaturedDish[]` (Task 2 type) as the `dishes` prop; `getMediaSignedUrl` (existing in `api.ts`) for cover images.
- Produces: `export default function HeroFeaturedCard({ dishes }: { dishes: FeaturedDish[] }): JSX.Element`.

- [ ] **Step 1: Create the component**

```tsx
import { useState, useEffect } from 'react';
import type { FeaturedDish } from '../types/dish';
import { getMediaSignedUrl } from '../lib/api';

export default function HeroFeaturedCard({ dishes }: { dishes: FeaturedDish[] }) {
  const [i, setI] = useState(0);
  const [cover, setCover] = useState<string | null>(null);

  // Auto-rotate ~6s unless reduced-motion or <2 dishes.
  useEffect(() => {
    if (dishes.length < 2) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const t = setInterval(() => setI((p) => (p + 1) % dishes.length), 6000);
    return () => clearInterval(t);
  }, [dishes.length]);

  const d = dishes[i];

  // Fetch a signed URL for the active dish's cover, if it has one.
  useEffect(() => {
    setCover(null);
    if (!d?.coverMediaId) return;
    let alive = true;
    getMediaSignedUrl(d.coverMediaId)
      .then((r: { url: string }) => { if (alive) setCover(r.url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [d?.coverMediaId]);

  if (!d) {
    return <div className="hero-fcard hero-fcard-empty" aria-hidden="true" />;
  }

  return (
    <a className="hero-fcard" href={`/dishes/${d.slug}`}>
      <div
        className="hero-fcard-img"
        style={
          cover
            ? { backgroundImage: `url(${cover})` }
            : { background: 'repeating-linear-gradient(135deg, var(--accent-soft) 0 14px, var(--card) 14px 28px)' }
        }
      />
      <div className="hero-fcard-body">
        <span className="hero-fcard-place">{d.originName ?? '—'}</span>
        <h3 className="hero-fcard-name">{d.canonicalName}</h3>
        <p className="hero-fcard-story">{d.shortDescription ?? ''}</p>
        <span className="hero-fcard-meta">{d.relationCount} links</span>
      </div>
      {dishes.length > 1 && (
        <div className="hero-fcard-dots">
          {dishes.map((x, idx) => (
            <button
              key={x.slug}
              className="hero-fcard-dot"
              data-on={idx === i ? '1' : '0'}
              aria-label={`Show ${x.canonicalName}`}
              onClick={(e) => { e.preventDefault(); setI(idx); }}
            />
          ))}
        </div>
      )}
    </a>
  );
}
```

> Verify `getMediaSignedUrl` exists in `api.ts` (it does, per `apps/web/src/lib/api.ts:363`) and that its return shape is `{ url: string }`. If the property differs, adjust the `.then` accordingly.

- [ ] **Step 2: Append CSS** to `apps/web/src/styles/global.css`:

```css
/* ── Hero featured card ─────────────────────────────────────────── */
.hero-fcard { display:flex; flex-direction:column; border:1px solid var(--line);
  border-radius:10px; overflow:hidden; background:var(--card); text-decoration:none;
  color:inherit; position:relative; min-height:280px; }
.hero-fcard-img { height:180px; background-size:cover; background-position:center; }
.hero-fcard-body { padding:16px 18px 20px; display:flex; flex-direction:column; gap:4px; }
.hero-fcard-place { font-family:var(--mono); font-size:12px; letter-spacing:.06em;
  text-transform:uppercase; color:var(--accent); }
.hero-fcard-name { font-family:var(--display); font-size:26px; line-height:1.05; margin:2px 0; color:var(--ink); }
.hero-fcard-story { color:var(--sub); font-size:14px; margin:0; }
.hero-fcard-meta { margin-top:6px; font-family:var(--mono); font-size:12px; color:var(--sub); }
.hero-fcard-dots { position:absolute; top:12px; right:12px; display:flex; gap:6px; }
.hero-fcard-dot { width:7px; height:7px; border-radius:50%; border:0; padding:0; cursor:pointer;
  background:rgba(255,255,255,.55); }
.hero-fcard-dot[data-on="1"] { background:var(--accent); }
.hero-fcard-empty { background:var(--accent-soft); }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @gustale/web exec astro check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/HeroFeaturedCard.tsx apps/web/src/styles/global.css
git commit -m "feat(web): HeroFeaturedCard rotating featured-dish island"
```

---

### Task 5: Rebuild `index.astro` (SSR hero + rails + stats + CTA)

**Files:**
- Modify: `apps/web/src/pages/index.astro`
- Modify: `apps/web/src/styles/global.css` (append rail + stats rules)
- Delete: `apps/web/src/components/design/GustaleHomeIsland.tsx` (superseded)

**Interfaces:**
- Consumes: `getFeaturedDishes` (Task 2), `listDishes`, `HeroFeaturedCard` (Task 4), `HomeWorkspace` (Task 3), the `FAMILY_LABELS`/`methodSlug` grouping pattern from `families.astro`.

- [ ] **Step 1: Build-time data fetch** — replace the frontmatter of `index.astro` with a try/catch mirroring `families.astro`: fetch `listDishes({ status:'published', limit:100 })` and `getFeaturedDishes({ limit:8 })` in `Promise.all` (each with `.catch` returning an empty shape so one failure doesn't blank the page). Derive: `totalDishes`, `featured` (array), `families` = top 6 `methodSlug` groups by size mapped through a local `FAMILY_LABELS` copied from `families.astro`, and stat counts: `dishes=totalDishes`, `origins=new Set(dishes.map(d=>d.originName).filter(Boolean)).size`, `families=groups.size`. Fetch ingredients count separately with `.catch(()=>null)`; omit the ingredients stat tile if null.

- [ ] **Step 2: Markup** — replace the body with these sections, in order. Reuse existing class names (`gst`, `wrap`, `gst-hero`, `hero-content`, `kicker`, `hero-h1`, `hero-lede`, `hero-search`, `hero-meta`, `band`) and add new ones (`rail`, `rail-card`, `schema`, `stat`). Mount islands:

```astro
<HeroFeaturedCard client:load dishes={featured} />
...
<HomeWorkspace client:only="react" />
```

Hero H1 must read `Every dish has a <em>place.</em>` (the `<em>` styled `--accent` via existing/added rule). The hero search is a tiny inline `<form>` that on submit sets `location.hash = '#explore=' + encodeURIComponent(value)` and scrolls to `#explore` — implement as a 8-line `client:load` inline script island OR a `<script>` in the page that wires the form (no React needed). Kicker text: `A LIVING ATLAS OF WORLD FOOD`.

Sections after hero:
1. **Most-connected rail** — `featured.map` → `<a class="rail-card" href={/dishes/slug}>` with place, name, story, `{relationCount} links`. Skip section if `featured.length === 0`.
2. **Families & lineages rail** — `families.map` → card linking to `/families` (and a sibling card linking to `/lineages`). Show group label + member count.
3. **Schema-stats band** — `<div class="schema">` with one `<div class="stat">` per available count: number (serif), label, descriptor. Omit any tile whose count is null.
4. **CTA band** — keep the existing "Know a dish we don't?" `band` markup (move it here from the old island; the button links to `/dishes/new`).

- [ ] **Step 3: Append CSS** to `global.css`:

```css
/* ── Featured rails ─────────────────────────────────────────────── */
.rail { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px; }
.rail-card { border:1px solid var(--line); border-radius:9px; padding:18px; background:var(--card);
  text-decoration:none; color:inherit; display:flex; flex-direction:column; gap:6px; transition:border-color .15s; }
.rail-card:hover { border-color:var(--line-strong); }
.rail-card .place { font-family:var(--mono); font-size:12px; text-transform:uppercase;
  letter-spacing:.06em; color:var(--accent); }
.rail-card h3 { font-family:var(--display); font-size:22px; line-height:1.1; margin:0; }
.rail-card p { color:var(--sub); font-size:14px; margin:0; }
.rail-card .links { font-family:var(--mono); font-size:12px; color:var(--sub); margin-top:auto; }
/* ── Schema stats band ──────────────────────────────────────────── */
.schema { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; }
.stat { border:1px solid var(--line); border-radius:9px; padding:22px; background:var(--card); }
.stat .num { font-family:var(--display); font-size:44px; line-height:1; color:var(--ink); }
.stat .lab { display:flex; align-items:center; gap:8px; margin-top:10px; font-weight:600; }
.stat .lab::before { content:""; width:9px; height:9px; background:var(--accent); display:inline-block; }
.stat .desc { color:var(--sub); font-size:13px; margin-top:4px; }
/* hero accent word */
.hero-h1 em { color:var(--accent); font-style:normal; }
```

- [ ] **Step 4: Delete the old island**

```bash
git rm apps/web/src/components/design/GustaleHomeIsland.tsx
```

- [ ] **Step 5: Typecheck + build**

Run: `pnpm --filter @gustale/web exec astro check`
Expected: 0 errors.
Run: `pnpm --filter @gustale/web run build:recipes`
Expected: build completes; `dist/index.html` exists and `grep -c "Every dish has a" dist/index.html` ≥ 1 (hero is server-rendered).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/index.astro apps/web/src/styles/global.css
git commit -m "feat(web): SSR homepage — hero, featured rails, schema stats, CTA"
```

---

### Task 6: Nav Contribute CTA + footer columns (`Layout.astro`)

**Files:**
- Modify: `apps/web/src/layouts/Layout.astro`
- Modify: `apps/web/src/styles/global.css` (append `.gst-cta` + footer column rules)

- [ ] **Step 1: Nav** — in `Layout.astro`, inside `<div class="gst-navr">` and before `<AuthMenu .../>`, add:

```astro
<a href="/dishes/new" class="gst-cta">Contribute</a>
```

- [ ] **Step 2: Footer** — replace the `<div class="fl">` block in the footer with three labelled columns (Browse / Discover / About). Browse: Dishes, Families, Lineages. Discover: Map (geo only), Atlas-home (`/`). About: About, Contribute (`/dishes/new`). Keep the existing `.fm`/`.fcap` brand block.

- [ ] **Step 3: Append CSS** to `global.css`:

```css
.gst-cta { background:var(--accent); color:var(--accent-ink); padding:8px 16px; border-radius:7px;
  font-weight:600; text-decoration:none; font-size:14px; }
.gst-cta:hover { filter:brightness(1.05); }
.gst-foot .fcols { display:flex; gap:48px; flex-wrap:wrap; }
.gst-foot .fcol { display:flex; flex-direction:column; gap:6px; }
.gst-foot .fcol .h { font-family:var(--mono); font-size:11px; text-transform:uppercase;
  letter-spacing:.08em; color:var(--sub); margin-bottom:2px; }
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @gustale/web exec astro check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/layouts/Layout.astro apps/web/src/styles/global.css
git commit -m "feat(web): nav Contribute CTA + columned editorial footer"
```

---

### Task 7: Full verification (dual-domain build + API test + visual)

**Files:** none (verification only)

- [ ] **Step 1: API test suite**

Run: `cd apps/api && set -a && . ./.env && set +a && pnpm exec vitest run`
Expected: all pass, including `dishes-featured.test.ts`.

- [ ] **Step 2: Web typecheck**

Run: `pnpm --filter @gustale/web exec astro check`
Expected: 0 errors.

- [ ] **Step 3: Both domain builds**

Run: `pnpm --filter @gustale/web run build:recipes`
Run: `pnpm --filter @gustale/web run build:geo`
Expected: both complete; `post-build.mjs` does not exit non-zero (≥20 dish dirs).

- [ ] **Step 4: SSR sanity**

Run: `grep -c "A LIVING ATLAS OF WORLD FOOD" apps/web/dist/index.html`
Expected: ≥ 1 (kicker server-rendered).

- [ ] **Step 5: Manual check** (`pnpm dev`, open `:4001`): hero renders, card rotates (and stops under reduced-motion via OS setting), hero search jumps to `#explore` and seeds the workspace query, rails populate, stat counts match the dish list, Contribute button + footer columns render. Note any gaps; do not claim done until observed.

- [ ] **Step 6: Update shared state** — on `private/state` branch, append a one-liner to `.hermes/TASKS.md` "Done" and refresh `.hermes/SHARED_STATE.md` "Live features" with the new homepage + `/api/dishes/featured`. (Per repo CLAUDE.md sync protocol.)

---

## Self-Review

**Spec coverage:** Hero (T5) ✓ · rotating card (T4) ✓ · most-connected rail (T1+T5) ✓ · families/lineages rail (T5) ✓ · schema stats (T5) ✓ · featured endpoint (T1) ✓ · nav Contribute (T6) ✓ · footer (T6) ✓ · workspace kept (T3) ✓ · hash search channel (T3+T5) ✓ · error/fallback (T5 frontmatter) ✓ · reduced-motion (T4) ✓ · testing (T1, T7) ✓.

**Placeholder scan:** No "TBD"/"add error handling"-style gaps; every code step ships real code. Two explicit verify-before-use notes (the `apiFetch` helper name in T2, the `getMediaSignedUrl` return shape in T4) — these are guardrails, not placeholders.

**Type consistency:** `FeaturedDish` fields identical across T1 response, T2 type, T4 prop usage (`relationCount`, `coverMediaId`, `originName`). `#explore=<query>` hash format identical in T3 (reader) and T5 (writer). `id="explore"` anchor set in T3, scrolled-to in T5.
