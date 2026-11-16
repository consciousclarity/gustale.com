# THE ROUTE INVENTORY — the recipes build, route by route

**Measured:** 2026-11-16, from the live `gustale-web-recipes` container's
`/usr/share/nginx/html` (the actual built dist), and cross-checked
against `gustale-web-geo`.

This is the list PR 1 must post. Every route the recipes build serves
today, and where each one goes.

---

## 1. The two builds, as they exist on the server right now

| | `gustale-web-recipes` (port 4001 → `gustale.recipes`) | `gustale-web-geo` (port 4002 → `gustale.com`) |
|---|---|---|
| top level | `404.html 50x.html _astro about account admin ar contribute dashboard data de dishes es families family favicon.ico favicon.svg fonts fr hero-world-land.svg hi id index.html ingredients ja lineages login pilot pt regions register robots.txt sitemap-en.xml sitemap.xml zh` | `404.html 50x.html _astro about account admin ar contribute dashboard data de dishes es families family favicon.ico favicon.svg fonts fr hero-world-land.svg hi id id index.html ja lineages login map pilot pt regions register robots.txt sitemap-{ar,de,en,es,fr,hi,id,ja,pt,zh}.xml sitemap.xml zh` |
| `/dishes` entries | **1,479** | **1,475** (flat `.html`) |
| `/ingredients` | **present** (5 pages + `index.html`) | **absent** |
| `/map` | **absent** | **present** |
| per-locale sitemaps | **1** (`sitemap-en.xml`) | **10** |

The recipes build has **one** locale sitemap; the geo build has ten.
That is the "two domains" the cutover removes.

---

## 2. The route table

`✔` = served today by the recipes build · `—` = not served

| route | recipes build | geo build | notes |
|---|:--:|:--:|---|
| `/` | ✔ | ✔ | the landing page |
| `/404` | ✔ | ✔ | served as `404.html` by nginx's `error_page` |
| `/dishes` | ✔ | ✔ | the dish list |
| `/dishes/<slug>` | ✔ | ✔ | recipes: `dishes/<slug>/index.html`; geo: flat `dishes/<slug>.html` |
| `/dishes/<kind>/<slug>` | ✔ | ✔ | the filter-kind pages (`category/`, `region/`, `technique/`) |
| `/dishes/new` | ✔ | — | **authoring** — stripped from geo by `post-build.mjs` |
| `/dishes/<slug>/edit` | ✔ | — | **authoring** — stripped from geo by `post-build.mjs` |
| `/ingredients` | ✔ | — | the ingredient index — stripped from geo |
| `/ingredients/<slug>` | ✔ | — | 5 pages live today |
| `/recipes` | — | — | **404 on both.** Lives in PR #216, unmerged |
| `/recipes/<slug>` | — | — | **404 on both.** Lives in PR #216, unmerged |
| `/families` | ✔ | ✔ | the family directory |
| `/family/<slug>` | ✔ | ✔ | |
| `/lineages` | ✔ | ✔ | |
| `/lineages/<slug>` | ✔ | ✔ | |
| `/regions` | ✔ | ✔ | |
| `/place/<slug>` | ✔ | ✔ | |
| `/about` | ✔ | ✔ | |
| `/about/evidence` | ✔ | ✔ | |
| `/contribute` | ✔ | ✔ | |
| `/login` | ✔ | ✔ | |
| `/register` | ✔ | ✔ | |
| `/account` | ✔ | ✔ | |
| `/dashboard` | ✔ | ✔ | |
| `/admin`, `/admin/dishes`, `/admin/dishes/<slug>`, `/admin/translations` | ✔ | ✔ | **Caddy blocks `/admin` on `gustale.com` today** — see §5 |
| `/map` | — | ✔ | geo only |
| `/pilot` | ✔ | ✔ | |
| `/data` | ✔ | ✔ | |
| `/<locale>/…` | ✔ | ✔ | `ar de es fr hi id ja pt zh` (9 locales), mirroring the routes above |
| `/sitemap.xml` | ✔ | ✔ | |
| `/robots.txt` | ✔ | ✔ | |

**The recipes build's locale set is the 9 without `en`** — `/en` is the
default, so the untranslated pages are at the root. The geo build has
the same 9 plus the 10 per-locale sitemaps.

---

## 3. What PR 1 must change

The recipes build is **the** build after the cutover. Everything the
geo build serves today that the recipes build does not, and everything
the recipes build serves that the geo build does not, must be ONE build
on `gustale.com`.

**Moves onto `gustale.com`:**

| route | from | to |
|---|---|---|
| `/ingredients`, `/ingredients/<slug>` | stripped from geo | **kept** |
| `/dishes/new` | stripped from geo | **kept** |
| `/dishes/<slug>/edit` | stripped from geo | **kept** |
| `/admin/**` | Caddy-blocked on gustale.com | **reachable** (needs the Caddy change in §5) |
| `/recipes`, `/recipes/<slug>` | in PR #216, unmerged | **built** |

**The old per-dish hub becomes a block, not a second page.** The recipes
build's `/dishes/<slug>` carries the recipe list for that dish. On
`gustale.com` that content becomes the **Recipes block** on the existing
`/dishes/<slug>` page, anchored at `#recipes` — not a separate
`/dishes/<slug>/recipes` page and not a second `/dishes` index.

**Kept on `gustale.com` (already there):** `/map`, `/families`,
`/family/<slug>`, `/lineages`, `/regions`, `/place/<slug>`, `/about`,
`/contribute`, `/login`, `/register`, `/account`, `/dashboard`, the 9
locale prefixes, and every `/dishes/<slug>`.

---

## 4. `post-build.mjs` — what has to stop happening

The current filter, in `apps/web/scripts/post-build.mjs`:

```js
const GEO_ONLY = ["map/"];
const RECIPES_ONLY = [];
…
const isGeoLike = DOMAIN === "geo";
const drop = isGeoLike ? RECIPES_ONLY : GEO_ONLY;
```

and then, for `DOMAIN === "geo"`:

```js
// drop /dishes/<slug>/edit/ for every slug, and /dishes/new/
// drop /ingredients/ entirely
// flatten dist/dishes/<slug>/index.html -> dist/dishes/<slug>.html
```

**After PR 1 there is one build and no per-domain filter.** The
`PUBLIC_DOMAIN` switch, the `GEO_ONLY`/`RECIPES_ONLY` lists, the
`/ingredients` drop, the `/dishes/new` + `/edit` drop and the
dishes-flattening step all go away. The build keeps everything.

The flattening step goes away too: it existed so nginx could rewrite
`/dishes/<slug>` to a flat file on the geo domain. With one build the
nested `dishes/<slug>/index.html` layout is what nginx's
`try_files $uri $uri/index.html` already serves, so the two
`location ~ ^/dishes/([^/.]+)` rewrite blocks in `apps/web/nginx.conf`
can go as well.

---

## 5. The `/admin` block — what the agent proposes, for the owner to decide

**Today:** `gustale.com` returns **404** for `/admin` (Caddy, in
`/etc/caddy/Caddyfile`), and `gustale.recipes` serves it. The comment
in the Caddyfile says the block exists because "/admin is for
gustale.recipes admins only".

**The problem:** after PR 1 the authoring surface lives on
`gustale.com`, and `/admin` is the admin editor's home. A redirect-only
`gustale.recipes` cannot host it.

**What the agent proposes (NOT applied — this needs the owner's
decision):**

1. **Unblock `/admin` on `gustale.com`** — remove the `@admin_block`
   handler from the `gustale.com, www.gustale.com` block. The block is
   a *host* policy, not an auth policy: `/admin/**` pages are
   SSR'd and the API calls behind them go through `/api/admin/*`,
   which is blocked on the **public API host** (`api.gustale.com`)
   and must stay blocked there.

2. **Keep `/api/admin/*` blocked on the public API host.** Unchanged.

3. **Add an explicit admin guard rather than relying on the host.** The
   admin pages must require an admin session on the server side, so
   "reachable" does not mean "open". The agent's proposal is that
   `/admin/**` requires an authenticated admin session, and returns 404
   (not 403) without one — so the route's existence is not advertised.

4. **The trusted-origins list keeps `gustale.recipes` during the
   transition** (the user asked for this), so an admin session
   created before the cutover still validates. The list is in
   `apps/api/src/auth.ts`:

   ```ts
   trustedOrigins: [
     "http://localhost:3000",
     "http://localhost:4000",
     "https://gustale.com",
     "https://www.gustale.com",
     "https://gustale.recipes",
     "https://www.gustale.recipes",
   ],
   ```

   `recipes.gustale.com` is **not** in it today and does not need to
   be: that host serves the same build, and its requests are
   same-origin to itself. The user's instruction is to keep
   `gustale.recipes` trusted **only during the transition**; the
   removal is a separate, later change.

---

## 6. The measurement that has to happen on the built site

| check | expected |
|---|---|
| `/recipes` direct load | **200** |
| `/recipes` refresh | **200** |
| `/recipes/` (with slash) | **301 → `/recipes`**, one hop |
| `/recipes/<slug>` direct load | **200** (once a recipe is published; until then the hub's empty state is the honest page) |
| `/recipes/<slug>` refresh | **200** |
| `/ingredients` , `/ingredients/<slug>` | **200** |
| `/dishes/new` , `/dishes/<slug>/edit` | **200** |
| `/login` , `/register` , `/account` , `/dashboard` | **200** |
| every `/<locale>/…` | **200** |

**The trailing-slash question is the one that bites.** `apps/web/nginx.conf`
has:

```nginx
try_files $uri $uri/index.html =404;
```

For `/recipes` (no slash): `$uri` = `/recipes` → `dist/recipes` is a
**directory**, not a file, so it falls to `$uri/index.html` =
`dist/recipes/index.html`. ✔

For `/recipes/` (with slash): `$uri` = `/recipes/` → `$uri/index.html` =
`dist/recipes//index.html` → **does not exist** → `=404`. ✘

So the trailing-slash form needs an explicit rule, or the canonical
form has to be the slashed one. **One of them must 301 to the other,
in one hop** — the user's requirement. The cheapest fix that keeps the
canonical form `/recipes` is an nginx `location = /recipes/` that
301s to `/recipes`.

Astro's `trailingSlash` config decides which form the built pages
prefer, and it must agree with the nginx rule — otherwise the build
emits links to the form that redirects.
