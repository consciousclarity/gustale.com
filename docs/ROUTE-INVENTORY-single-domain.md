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
| `/admin`, `/admin/dishes`, `/admin/dishes/<slug>`, `/admin/translations` | ✔ | ✔ | **STATIC SHELLS, not SSR'd** — see the note below and §5 |
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

## 2.1 The `/admin` pages are STATIC SHELLS, not server-rendered

**This matters for every claim about `/admin` in this document, so it
is stated on its own.**

The site ships as a **fully-static Astro build**. There is no SSR
adapter (`apps/web/astro.config.mjs` sets no `output:`), so
`apps/web/src/middleware.ts` **never runs at request time** — it runs
only during `astro build`, where there is no request cookie.

**And it FAILS OPEN there.** The middleware's own comment says so:

> *"Build-time safety: the site ships as a fully-static Astro build (no
> SSR adapter), so this middleware runs only during `astro build`,
> where there is no request cookie. In that case — and for any request
> without a session cookie — it FAILS OPEN: the gated pages are emitted
> as real static HTML (shell only; no data) instead of a /login
> redirect stub."*

So the `/admin` files in the dist are **real static HTML**: the
`AdminLayout` shell (sidebar + top bar), with the content coming from
the `<AdminDashboard />` React island, which fetches **client-side**
from `/api/admin/stats`.

**What that means, concretely:**

| | |
|---|---|
| the page shell | is in the built output and is served to anyone who asks for the path |
| the DATA | is not in the built output — it is fetched per-request from `/api/admin/*`, which requires admin auth and returns 401/403 otherwise |
| the middleware role gate | does **not** run at request time; it is a build-time gate that fails open |
| the real gate | **the admin API**, plus the edge (Caddy) that decides which host exposes `/admin` at all |

**So "Caddy blocks `/admin` on `gustale.com`" is the only thing
protecting the shell today** — not the middleware. The shell carries no
privileged data, so an anonymous visitor who reaches it sees an empty
admin frame and every data call fails with 401/403.

**The consequence for the cutover:** unblocking `/admin` on
`gustale.com` exposes a **shell**, not data. The data is protected by
`/api/admin/*`, which stays authenticated. §5 states what must be
proven before and after the change, and the proof is in the API
responses, not in the page.

The same is true of `/dashboard`: a static shell with empty states,
gated at the API.

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
| `/admin/**` | Caddy-blocked on gustale.com | **reachable** (the Caddy change in §5 — the shell; the DATA stays behind `/api/admin/*`) |
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

**THE OWNER'S DECISION (2026-11-16): admin moves to `gustale.com`,
under these conditions.**

1. **Unblock `/admin` AND `/api/admin/*` on `gustale.com` only**
   (same origin). The `@admin_block` handler comes out of the
   `gustale.com, www.gustale.com` block, and the site block gains a
   same-origin `/api/admin/*` route.

2. **Keep `/api/admin/*` blocked on `api.gustale.com`.** Unchanged.
   The public API host must not serve the admin API to anyone.

3. **Prove, logged out, that every `/api/admin/*` route returns 401/403
   and that the static admin shell renders no data.**

4. **Prove, signed in as admin on staging, that the admin editor loads
   and saves.**

### Why the shell can be exposed safely — the architecture, corrected

**An earlier draft of this section said the `/admin` pages are "SSR'd"
and that the fix was "an explicit admin guard rather than relying on
the host".** Both claims were wrong, and the correction matters,
because the wrong claim implies a guard that does not exist.

**There is no SSR.** The site ships as a fully-static Astro build, so
`src/middleware.ts` does not run at request time and there is **no
server-side session gate on the page**. See §2.1.

**So what actually protects the admin data?**

| layer | what it does |
|---|---|
| the static shell | contains **no data** — the content is a React island that fetches at runtime |
| `/api/admin/*` | **requires admin auth** and returns 401/403 otherwise — this is the real gate |
| Caddy on `gustale.com` | decides whether `/admin` is exposed at all |
| Caddy on `api.gustale.com` | keeps `/api/admin/*` blocked, so the API is not reachable from the public API host |

**The consequence:** exposing `/admin` on `gustale.com` exposes a
**shell**. A visitor who loads it sees an empty admin frame, and every
data call returns 401/403. That is exactly what condition 3 requires
to be proven.

**The middleware is not the guard, and this is worth being explicit
about:** the `AdminLayout` shell renders for anyone. The protection is
the API, not the page. The page being reachable is not a data leak; the
data is reachable only through the API, and the API checks the session
on every request.

**The `/api/admin/*` route on `gustale.com` is same-origin** — the
browser calls a relative `/api/admin/...` path, so the site block needs
its own route to it, exactly as the staging vhost already does. It
must be the **same origin as the page**, so the session cookie is sent
and no cross-origin credential question arises.

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
