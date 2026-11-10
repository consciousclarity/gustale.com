# Recipes → gustale.com — the domain migration: preparation, inventory, and the DNS answer

**Prepared:** 2026-11-10
**Status:** **STEP 1 (prepare) COMPLETE.** Steps 2–8 are ready to start.
**The plan:** the owner's document *"Gustale recipes → gustale.com migration
plan"* — **not found on this machine, the VPS, either repository, GitHub, the
browser history, or any agent transcript.** See §0.

---

## 0. The plan document was not found — and what that blocks

The owner approved a document called **"Gustale recipes → gustale.com
migration plan"**, with all the decisions in its Decisions table. Every
location I can reach was searched:

| searched | result |
|---|---|
| `/home/alex/projects/gustale.com` (all branches, `docs/`, `scripts/`, `design/`) | not present |
| `/home/alex/projects/gustale-state` (all branches, `.hermes/`, `BACKLOG.yaml`) | not present |
| the VPS `srv626116` — the whole filesystem, every profile, `.hermes/`, `projects/` | not present |
| the Windows host (`/mnt/c/Users/alex`) — Desktop, Documents, Downloads, `projects/` | not present |
| GitHub — all 100 PRs of the public repo, by title and body | no match |
| the Chrome history on the Windows host — every URL and title | no match |
| the Claude Code, Codex and MiniMax Code transcripts | no match |
| the Hermes session DBs (local, 1 GB, and the VPS `gustale` profile, 903 MB) | only October operational notes about which container serves which host |
| the Google Docs the owner has visited | only `SOUL.md`, personas, and marena documents |

**What this blocks:** steps 2–8 are gated on the plan's **Decisions table**.
The decisions that determine *what the app must do* — the new origin
constant, the redirect set, the canonical and sitemap behaviour, the
noindex scope, and the P1–P10 test definitions — are exactly what that
table holds. **I will not guess them.** The decisions I *did* find, in
`docs/RECIPES-TASK-RESUME.md` and ADR-007-A1 §5.3, are about the
*content* migration (the 301 path set, the noindex rule for empty hubs);
they are not the domain-migration plan.

**What is NOT blocked, and is done:** everything that is the same under any
version of the plan — the live inventory, the DNS answer, and the origin
inventory in §3. Those are below.

---

## 1. The live baseline, measured 2026-11-10

| URL | status | bytes |
|---|---|---|
| `https://gustale.recipes/` | **200** | 21,284 |
| `https://gustale.recipes/dishes/` | **200** | 78,644 |
| `https://gustale.recipes/dishes/moussaka-greek` | **200** | 50,217 |
| `https://gustale.recipes/sitemap.xml` | **200** | 235 |
| `https://gustale.recipes/robots.txt` | **200** | 523 |
| `https://gustale.com/` | **200** | 20,561 |
| `https://recipes.gustale.com/` | **no DNS — does not resolve** | — |

### The serving topology (from the VPS)

```
Caddy
├── gustale.com, www.gustale.com        → 127.0.0.1:4002   (gustale-web-geo)
├── gustale.recipes, www.gustale.recipes → 127.0.0.1:4001  (gustale-web-recipes)
├── api.gustale.com, api.gustale.recipes → 127.0.0.1:4000  (gustale-api)
└── (recipes.gustale.com — NOT CONFIGURED)
```

**The recipes container already exists and already serves the recipes
site.** `gustale-web-recipes` is live on port 4001 behind
`gustale.recipes`. The migration is therefore a **host rename**, not a
new application: a Caddy site block for `recipes.gustale.com` pointing
at the same `127.0.0.1:4001`, plus the DNS record, plus the baked
origin inside the image.

---

## 2. The DNS record — the exact answer

### Where the zone lives

Measured with DNS-over-HTTPS (this host has no `dig`, `host`, or
`nslookup`):

```
gustale.com      NS  launch1.spaceship.net.
                 NS  launch2.spaceship.net.
gustale.recipes  NS  launch1.spaceship.net.
                 NS  launch2.spaceship.net.
```

**Both domains are on Spaceship's own nameservers. Cloudflare is not in
the path for either one.** So the record is added in the Spaceship
panel — *not* in Cloudflare.

### The record to add

| field | value |
|---|---|
| **type** | `A` |
| **name / host** | `recipes` (or `recipes.gustale.com` if the panel wants the FQDN) |
| **value / points to** | `62.72.7.218` |
| **TTL** | `3600` (or the panel's default) |
| **proxy / CDN** | **not applicable** — Spaceship's DNS is authoritative, there is no proxy layer to toggle |

It is the same shape as the existing `gustale.recipes` A record, which
already points at `62.72.7.218`.

### The API key: **there isn't one to give you**

**Spaceship has no public DNS API.** This is documented in the archived
`civic-dns-provisioning` skill on the VPS
(`/root/.hermes/skills/.archive/civic-dns-provisioning/references/registrar-api-matrix.md`):

> **Does NOT have public DNS API (delegate to cloudflare)**
> - Spaceship
> …
> **Spaceship-specific facts**
> - Owned by the Namecheap group.
> - Has a single product called "PremiumDNS" which is a paid add-on.
>   Not a public API — it's a UI/panel feature enabling advanced records.
> - Dashboard URL is `spaceship.com/dashboard` after login.
> - For DNS automation specifically: **delegate to cloudflare**.
>   Spaceship is registrar-only for these projects.

So **no API key exists to request.** The record must be added by hand
in the Spaceship dashboard:

> `spaceship.com/dashboard` → **Domains** → **gustale.com** →
> **Advanced DNS** → add `A` / `recipes` / `62.72.7.218`

**If you want it scripted instead**, the only supported route is to
delegate `gustale.com`'s DNS to Cloudflare and add the record there —
that is a **nameserver change at the registrar**, which changes the
authoritative DNS for the whole domain. That is a bigger blast radius
than a single A record, so I have **not** done it and am not proposing
it as part of these steps. Say the word if you want that option costed.

---

## 3. The origin inventory — 77 places, 29 files

The recipes origin is **baked into the built image**, not read at
runtime. `PUBLIC_DOMAIN=geo|recipes` selects *which site* is built;
the origin string is separate and hard-coded.

### The four load-bearing definitions

| file | what it holds | must change |
|---|---|---|
| `apps/web/src/lib/domain.ts` | `RECIPES_ORIGIN`, `ATLAS_ORIGIN`, `siteName()`, `recipesUrl()`, `authoringHref()` | **yes** |
| `apps/web/src/lib/locales.ts` | `siteOrigin(domain)` — the per-locale origin | **yes** |
| `scripts/generate_sitemaps.mjs` | `siteOrigin(domain)` — the sitemap + robots origin | **yes** |
| `apps/web/src/layouts/Layout.astro` | the canonical origin (line 117), the footer links (207, 214) | **yes** |

### The rest, by category

| category | files | notes |
|---|---|---|
| **build helpers** | `browse-helpers.mjs`, `search-nav-helpers.mjs` | each declares its own `RECIPES_ORIGIN` |
| **build validators** | `validate-build.mjs` (10) | asserts the canonical and the switcher link — these are the **tests that will fail** if the origin changes without the assertions changing |
| **build tests** | `test-browse.mjs`, `test-search-nav.mjs` (10) | hard-code the origin in expectations |
| **pages & components** | `Nav.astro`, `Layout.astro`, `dishes/[slug].astro`, `ingredients/[slug].astro`, `about.astro`, `RecipesHome.astro`, `EditDishButton.tsx`, `GustaleAppIsland.tsx` | the `<title>`, the footer, the property switcher, the canonical |
| **scripts** | `check-live-sitemaps.sh`, `smoke-map-pages.mjs`, `rebuild-web-live.sh`, `build-web-live.sh`, `verify-admin.sh`, `verify-pantry-seed.sh`, `refresh-ss-mock.mjs` | the live checks and the deploy scripts name the host |
| **comments only** | `post-build.mjs`, `api.ts`, `middleware.ts`, `env.d.ts`, `mock-api.mjs`, `mock-api-data.json` | prose, except `middleware.ts`'s API allowlist and `mock-api-data.json`'s provenance line |

### The API host does **not** move

`api.gustale.recipes` is a **different domain** and stays exactly where
it is. It appears in `apps/web/src/middleware.ts`'s CORS allowlist and
in `scripts/hermes/rebuild-web-live.sh`'s `GUSTALE_API_BASE`. **Neither
changes.** A migration that touched the API host would break both
sites at once.

---

## 4. Why the origin must become a build-time input, not a constant

The plan's own principle — a host rename with **no** chance of the two
sites being live at once — is only achievable if the origin is a
**single** build input:

```
PUBLIC_DOMAIN=geo       → https://gustale.com
PUBLIC_DOMAIN=recipes   → https://gustale.recipes          (today)
PUBLIC_DOMAIN=recipes   → https://recipes.gustale.com     (the new host)
```

The dark launch then needs **both** hosts served from the **same**
image, with the origin differing per host — which a single baked
constant cannot do. The two candidate designs:

1. **Two images.** Build the recipes site twice, once per origin, and
   let Caddy route each host to its own image. Simple, but the two
   images can drift, and the sitemap/robots/canonical must be
   regenerated for each.
2. **One image, origin resolved at request time.** Serve the recipes
   site from one container and have the origin follow the `Host`
   header. One artifact, no drift — but it means the canonical, the
   sitemap and robots.txt become per-request, and the static build
   cannot bake them.

**The plan's Decisions table decides which.** That is the first thing I
need from it.

---

## 4a. What the dark launch actually requires — measured, not assumed

Three facts measured on the VPS and the live site, because they decide
the design:

### Fact 1 — the two web containers share an IDENTICAL nginx config

```
3eb2423016b7f05a834184055ff31ef9  gustale-web-recipes:/etc/nginx/conf.d/gustale-web.conf
3eb2423016b7f05a834184055ff31ef9  gustale-web-geo:    /etc/nginx/conf.d/gustale-web.conf
```

The **only** difference between the two sites is the baked static
content. `server_name _` in both, so **nginx does not care which host
it serves** — Caddy decides, by the `Host` header.

**Consequence: one image can serve both hosts at once.** The dark
launch does not need a second build; it needs a second Caddy route to
the *same* container.

### Fact 2 — the canonical and the sitemap origin are BAKED into the image

```
docker exec gustale-web-recipes grep canonical index.html
  → rel="canonical" href="https://gustale.recipes/"

docker exec gustale-web-recipes cat sitemap.xml
  → <loc>https://gustale.recipes/sitemap-en.xml</loc>
```

**This is the constraint that matters.** Serving today's recipes image
on `recipes.gustale.com` would serve pages whose canonical points at
`gustale.recipes` — a canonical to the *wrong host*. Search engines
follow it, so the new host would canonicalise itself away to the old
one. That is the opposite of a dark launch, and it is worse than doing
nothing.

**So the dark launch needs an image whose origin is
`https://recipes.gustale.com`.** The origin has to become a build
input.

### Fact 3 — the image tags are already per-variant

```
gustale-web-recipes:live-data-923391b-recipes
gustale-web-geo:     live-data-923391b-geo
```

`scripts/hermes/build-web-live.sh` already builds one image per
`PUBLIC_DOMAIN` value, and the tag carries the variant. **A third
variant (`recipes` on the new origin) fits the existing build with no
new machinery** — it is a new `--build-arg` value and a new tag suffix.

### The two designs, now with their real cost

**Design A — a second build (two images).**
Build the recipes site with the new origin; run it as a **third
container** on a third port (e.g. 4003); point Caddy's
`recipes.gustale.com` block at it. `gustale.recipes` keeps its own
container, untouched.

- the new host's canonical, sitemap and robots are **all correct**;
- the old host is **completely unaffected** — no risk to the live
  site, which matters because the cutover is the owner's call;
- two images, so they can drift — but during a dark launch the old
  one is frozen, so drift is a cutover-time question, not a
  live-site question;
- cost: one extra image build and one extra container.

**Design B — one image, origin resolved at request time.**
Serve both hosts from one container and resolve the origin from the
`Host` header.

- one artifact, no drift;
- but the **canonical, the sitemap and robots.txt become per-request**,
  and the static build cannot bake them. That is a real rewrite of the
  build, and the sitemap generator would have to stop being a
  build-time step;
- and the noindex for the dark launch would have to be applied at
  request time too — nginx `add_header X-Robots-Tag "noindex"`, which
  is easy, but it makes the dark launch a *serving* behaviour rather
  than a *build* behaviour.

**Design A is the smaller change and the safer one**, and it fits the
existing build exactly. **The plan's Decisions table may decide
otherwise**, and if it says Design B, that is a much larger piece of
work than the host rename it looks like.

---

## 5. What I need from you

**The plan document itself** — paste it, attach it, or give me the path.
The minimum I need is the Decisions table, but the full document is
better, because steps 4–8 (the dark launch and P1–P10) are defined by
it.

If it is easier, these are the specific questions the plan must answer,
and I will proceed on them if you dictate the answers:

1. **The new origin** — `https://recipes.gustale.com`?
2. **Which design** — two images (§4.1) or one image with a
   request-time origin (§4.2)?
3. **During the dark launch, does `gustale.recipes` keep serving** the
   live site, or does it move to the new host immediately and the old
   host 301 to the new one?
4. **The noindex scope** — every page on the new host, or only the
   empty hubs? And is it a `noindex, follow` meta, a `robots.txt`
   `Disallow: /`, or both?
5. **The P1–P10 list** — the ten pre-launch checks, and what each one
   asserts.

---

## 6. The DNS record, in one line

```
type A   name recipes   value 62.72.7.218   TTL 3600
```

added at `spaceship.com/dashboard` → Domains → `gustale.com` →
Advanced DNS. **No API key exists** — Spaceship has no public DNS API.

---

## 7. Related documents

- `docs/RECIPES-TASK-RESUME.md` — the 8-item recipes task list, and the
  §5.3 301 path set from ADR-007-A1.
- `docs/ADR-007-A1-recipes-confidence-autopublish-contributors-language-urls.md`
  — the content-side decisions (the noindex rule for empty hubs, the
  self-canonical rule, the recipes sitemap scope).
- `apps/web/src/lib/domain.ts` — the domain helpers, and the reason
  `authoringHref()` exists.
- `scripts/hermes/build-web-live.sh` — how the two images are built on
  the VPS, from live data.
