# Cutover plan — gustale.recipes → recipes.gustale.com

**Status: PREPARED, NOT EXECUTED.** Nothing in this document has been done.
The owner's instruction (2026-11-12): *don't cut over yet. gustale.recipes
stays the live canonical. Don't change PUBLIC_DOMAIN, canonicals,
sitemaps, redirects or Search Console until I say go.*

This document is what to run **when the owner says go**.

---

## 0. Why this is not just a DNS change

Moving the recipes site from `gustale.recipes` to `recipes.gustale.com` is
a **domain migration**, and two facts make it more than a DNS edit:

### 0.1 `.recipes` is a public suffix

From the Public Suffix List (fetched and checked 2026-11-12):

```
recipes                      <- a bare public-suffix rule
com                          <- a bare public-suffix rule
```

`.recipes` is a public suffix, so the **registrable domain** of
`gustale.recipes` is `gustale.recipes` itself — not `com`. The
consequences:

| host | eTLD+1 (registrable domain) |
|---|---|
| `gustale.recipes` | `gustale.recipes` |
| `api.gustale.recipes` | `gustale.recipes` |
| `gustale.com` | `gustale.com` |
| `api.gustale.com` | `gustale.com` |
| `recipes.gustale.com` | `gustale.com` |

**`gustale.recipes` and `gustale.com` are separate registrable domains.**
That is why `gustale.recipes` can never set a cookie for `gustale.com`,
and why the passkey RP ID is a separate problem (§5).

### 0.2 The recipes build bakes the hostname in

The origin is not a runtime value. It is baked at build time in **at
least four places**, and a cutover that misses one produces a site whose
canonicals point at the old host:

```
apps/web/src/lib/domain.ts:14        RECIPES_ORIGIN = "https://gustale.recipes"
apps/web/src/lib/locales.ts:194      domain === "geo" ? "https://gustale.com" : "https://gustale.recipes"
apps/web/src/layouts/Layout.astro:117
apps/web/src/pages/dishes/[slug].astro:152
scripts/generate_sitemaps.mjs:44     siteOrigin(domain)
apps/web/scripts/search-nav-helpers.mjs:7   RECIPES_ORIGIN
apps/web/scripts/browse-helpers.mjs:7        RECIPES_ORIGIN
apps/web/scripts/validate-build.mjs:732
```

Plus `PUBLIC_DOMAIN` itself, which selects the `geo`/`recipes` build
variant — see `apps/web/src/lib/domain.ts` and
`apps/web/src/env.d.ts`.

---

## 1. What is already done (the preparation, 2026-11-12)

Everything below is **live** and does not change any canonical, redirect
or index state.

### 1.1 `recipes.gustale.com` is served

`/etc/caddy/sites/recipes.gustale.com.caddy`, imported from the
Caddyfile. It is a copy of the `gustale.recipes` vhost with one
difference: the `noindex` header.

```
/etc/caddy/sites/recipes.gustale.com.caddy
```

It serves the same recipes build (upstream `127.0.0.1:4001`), with the
`/media/*` MinIO proxy, the `/api/*` proxy, and all five security
headers. **The first version of this block was a 3-line
`reverse_proxy` only** — every cover image was a 404 and every API call
was a 404. It was replaced with the full copy for that reason.

### 1.2 The certificate

Caddy obtained a Let's Encrypt certificate for `recipes.gustale.com` on
2026-11-12 09:30 UTC, via a normal managed cert + HTTP-01 challenge
(not on-demand TLS — the `on_demand_tls` ask endpoint returns
`{"error":"Unknown host"}` for gustale hosts, and the gustale vhosts get
managed certs instead).

```
notBefore=Nov 12 00:31:56 2026 GMT
notAfter=Feb 10 00:31:55 2027 GMT
X509v3 Subject Alternative Name: DNS:recipes.gustale.com
```

### 1.3 The noindex

`X-Robots-Tag: noindex, nofollow` is on **every** response from the new
host — pages, media, API, sitemap, robots.txt. Verified on all ten.

> **Why the header and not a `<meta name="robots">`:** the HTML is the
> same build as `gustale.recipes`, so a meta tag would either require a
> second build or would make the canonical host noindex too. The header
> is per-host, authoritative, and covers assets. The `<link
> rel="canonical">` on the new host still points at `gustale.recipes`, so
> even if the header were ignored, the canonical attribute attributes
> the page to the canonical site.

> **Why `robots.txt` still says `Allow: /`:** robots.txt controls
> *crawling*, noindex controls *indexing*. `Allow: /` + `noindex` is the
> correct combination — Google fetches the page, sees the header, and
> does not index it. The opposite (`Disallow: /`) would stop the crawl
> entirely, so Google would never *see* the noindex, and the old URL
> would stay indexed longer with only its snippet demoted.

### 1.4 `recipe.gustale.com` (singular) — prepared, dormant

`/etc/caddy/sites/recipe.gustale.com.caddy`:

```
recipe.gustale.com {
	redir https://recipes.gustale.com{uri} permanent
}
```

**It is dormant.** The A record for `recipe.gustale.com` currently
points at `15.197.162.184` — a registrar's URL-redirect service, not
this VPS — so Caddy never sees the host.

The registrar's redirect already works, but it **drops the path**:

```
recipe.gustale.com/dishes/bakso/  ->  https://recipes.gustale.com/
recipe.gustale.com/families       ->  https://recipes.gustale.com/
```

Every deep link collapses onto the homepage. The Caddy block preserves
it:

```
recipe.gustale.com/dishes/bakso/  ->  https://recipes.gustale.com/dishes/bakso/
```

**Action needed from the owner:** point the `recipe.gustale.com` A
record at `62.72.7.218`. Caddy will then obtain the certificate
automatically (the HTTP-01 challenge works once DNS points here) and the
301 becomes ours — path-preserving, and re-pointable from the same place
as everything else.

> Until the DNS changes, Caddy attempted and failed to obtain a
> certificate for the singular host (Let's Encrypt validated against
> `15.197.162.184`, not this VPS). It failed **once**, then backed off —
> no retry storm, no rate-limit risk. Verified over 10 minutes.

---

## 2. The cutover — the ordered steps

> **Nothing below runs without the owner's go.**

### Step 0 — Pre-flight (read-only, safe to do any time)

```bash
# 1. The canonical host is healthy.
curl -fsS https://gustale.recipes/ >/dev/null && echo OK
curl -fsS https://api.gustale.com/health >/dev/null && echo OK

# 2. The new host serves the site identically.
curl -fsS https://recipes.gustale.com/ >/dev/null && echo OK
curl -fsS https://recipes.gustale.com/api/dishes?limit=1 >/dev/null && echo OK
curl -fsS https://recipes.gustale.com/media/dishes/moussaka-greek/cover-800w.webp >/dev/null && echo OK

# 3. The smoke passes on the new host.
scripts/smoke/run-smoke.sh --base https://recipes.gustale.com --wp WP-01
#    Expected: PASS 12 · FAIL 1 (the one failure is WP-05's)
```

### Step 1 — Change the origin in the code

This is the part that touches canonicals, so it happens **before** any
redirect, so the two are never out of step.

**The one-line change** in `scripts/generate_sitemaps.mjs`:

```js
// before
function siteOrigin(domain) {
  return domain === "geo" ? "https://gustale.com" : "https://gustale.recipes";
}
// after
function siteOrigin(domain) {
  return domain === "geo" ? "https://gustale.com" : "https://recipes.gustale.com";
}
```

**And the same value** in:

| file | line | what it is |
|---|---|---|
| `apps/web/src/lib/domain.ts` | 14 | `RECIPES_ORIGIN` |
| `apps/web/src/lib/locales.ts` | 194 | the domain→origin function |
| `apps/web/src/layouts/Layout.astro` | 117 | the canonical/hreflang origin |
| `apps/web/src/pages/dishes/[slug].astro` | 152 | the dish-page origin |
| `apps/web/scripts/search-nav-helpers.mjs` | 7 | `RECIPES_ORIGIN` |
| `apps/web/scripts/browse-helpers.mjs` | 7 | `RECIPES_ORIGIN` |
| `apps/web/scripts/validate-build.mjs` | 732 | the origin used by the assertions |

> **Do not change `PUBLIC_DOMAIN`.** It stays `recipes`. `PUBLIC_DOMAIN`
> selects the build *variant* (`geo` vs `recipes`), not the hostname.
> Changing it to `recipes.gustale.com` would fall through
> `resolveGustaleDomain`'s default and silently produce the geo build —
> the recipes site would become the Atlas.

**Then update the strings that name the property in prose and in the
UI** (these are cosmetic but should match):

```
apps/web/src/lib/domain.ts:69              siteName()
apps/web/src/components/Nav.astro:148      the property-switch label
apps/web/src/layouts/Layout.astro:207      the footer property link
apps/web/src/layouts/Layout.astro:214      the footer's "Recipes" link
apps/web/src/pages/ingredients/[slug].astro:52   the page title
apps/web/src/components/design/GustaleAppIsland.tsx:1657   the footer caption
apps/web/src/components/design/App.jsx:394              the footer caption
apps/web/src/pages/about.astro:5          the comment about /map
```

### Step 2 — Update the validate-build assertions

`apps/web/scripts/validate-build.mjs` asserts on the **literal** origin
string in five places, and will fail if they are not updated with the
code:

```
:128-129   countOccurrences(regionsHtml, 'href="https://gustale.recipes/"') >= 1
:603-607   the recipes home self-canonicals on gustale.recipes
:676       countOccurrences(navHtml, 'href="https://gustale.recipes/"') >= 1
:683       atlasSeeAll === "https://gustale.recipes/dishes?q=test%20query"
:696       atlasErr.some((l) => l.href === "https://gustale.recipes/dishes")
```

These are the assertions that would catch a half-done cutover. They are
the reason to change the code and the assertions **in the same commit**.

### Step 3 — Rebuild and deploy

The live-data build takes **~141 minutes** for 10 locales. It is the
same build as today, with a different origin string baked in.

```bash
# The deploy pipeline is the normal one: merge to main -> CI -> deploy.
# The recipe domain is built by build-web-live.sh with PUBLIC_DOMAIN=recipes.
```

**Verify on the new host before touching the old one:**

```bash
curl -s https://recipes.gustale.com/dishes/bakso/ | grep -o 'rel="canonical"[^>]*'
#   -> href="https://recipes.gustale.com/dishes/bakso"

curl -s https://recipes.gustale.com/sitemap-en.xml | head -5
#   -> <loc>https://recipes.gustale.com/dishes/...</loc>
```

**The old host must still be serving the old build** at this point. It
is a separate container image; the new build only replaces the
`gustale-web-recipes` container, which both hosts proxy to. So after
this step:

- `recipes.gustale.com` → new build, canonicals point at itself
- `gustale.recipes` → **also** the new build (same container)

That is fine and is the intended intermediate state — the old host's
canonicals will also point at the new host for a short window, which is
harmless (the canonical is correct; it just arrives a bit early).

### Step 4 — Turn gustale.recipes into a 301

Only after the new build is live and verified.

```caddy
gustale.recipes, www.gustale.recipes {
	redir https://recipes.gustale.com{uri} permanent
}
```

`{uri}` preserves the path **and** the query string:

```
gustale.recipes/dishes/bakso/  ->  https://recipes.gustale.com/dishes/bakso/
gustale.recipes/dishes?q=pho   ->  https://recipes.gustale.com/dishes?q=pho
```

> **Do NOT redirect the whole site to a bare origin.** `redir
> https://recipes.gustale.com permanent` would drop the path — the same
> bug the registrar's redirect has today. The 1,614 URLs in the
> sitemap each need to land on their own counterpart.

**The `/media/*` and `/api/*` proxies must keep working on the old
host until the redirect is in place** — and after the redirect they must
still work, because `/media/...` URLs are in Google's index and in
other people's links. A 301 on `/media/*` would be a 301 on an
immutable, cached asset.

> **Decision needed:** should `gustale.recipes/media/*` keep serving
> the bytes (200) or redirect? **Recommendation: keep serving 200.** A
> media URL is a URL of a file, not a page; redirecting it breaks
> `Cache-Control: immutable` semantics and adds a hop to every image.
> Same for `/api/*`: keep serving it. Only the *page* routes redirect.

### Step 5 — The Atlas-only paths

`/map` is the only Atlas-only path. It is already 404 on
`gustale.recipes` and 200 on `gustale.com`.

**No redirect is needed for it** — a request to `gustale.recipes/map`
already 404s, which is the correct answer. But there is a subtlety: if
a user had a link to `gustale.recipes/map` from before the split, it
would have been a 301 to `gustale.com/map` already. Nothing to do.

**The reverse direction does need a map** — see §3.

---

## 3. The 301 map

### 3.1 `gustale.recipes/*` → `recipes.gustale.com/*`

**Host-only replacement. Every path, every query string, one rule.**

```
/dishes/bakso/        ->  /dishes/bakso/
/dishes?region=...   ->  /dishes?region=...
/es/dishes/bakso/     ->  /es/dishes/bakso/
/families             ->  /families
/dishes/region/indonesia/ -> /dishes/region/indonesia/
/ingredients/salt     ->  /ingredients/salt
/dishes/new           ->  /dishes/new
/admin                ->  /admin
```

One Caddy `redir` rule covers all of them. There is **no path-specific
map** for the recipes→recipes direction, because the two hosts have
identical path structure — it is the same build.

### 3.2 The Atlas-only paths → `gustale.com`

The owner asked for "Atlas-only paths → gustale.com". There is exactly
**one** such path:

| path | on `gustale.recipes` today | on `gustale.com` |
|---|---|---|
| `/map` | **404** | 200 |

Since it already 404s on the recipes host, a redirect would only matter
for **old links** to `gustale.recipes/map` — which would have been
issued before the domains were split. If any exist in Google's index
for the recipes property, a 301 to `gustale.com/map` would preserve
them.

**Recommendation:** add one explicit rule, because it is cheap and it
recovers any stranded link:

```caddy
gustale.recipes {
	@atlas_map path /map
	redir @atlas_map https://gustale.com/map permanent
	redir https://recipes.gustale.com{uri} permanent
}
```

> **Order matters in Caddy:** the more specific `redir` with a matcher
> must come first. A bare `redir` catches everything.

### 3.3 The reverse direction — `recipes.gustale.com/*` → ?

**Nothing.** After the cutover, `recipes.gustale.com` is the canonical
and serves 200. Before the cutover it serves 200 with a noindex header.
It never redirects.

### 3.4 `api.gustale.recipes` — the API host

**Decision needed.** Today the API is served on both `api.gustale.com`
and `api.gustale.recipes`, and `gustale.recipes/api/*` proxies to the
same upstream.

`api.gustale.recipes` sits on the **old** registrable domain
(`gustale.recipes`), which is going away. After the cutover it becomes
an orphan: a hostname on a domain nobody points at any more.

**Recommendation: leave `api.gustale.recipes` serving 200** (do not
redirect it) for at least 6 months, and keep `api.gustale.com` as the
canonical API host. The reasons:

1. The API is not indexed and not linked in the sitemaps, so there is
   no SEO cost to leaving it.
2. `gustale.recipes/api/*` keeps working through the old host's
   `/api/*` proxy, so old frontend code that hardcodes it does not
   break.
3. Redirecting an API changes the `Origin` header the browser sends,
   which turns a same-origin request into a cross-origin one — and
   `CORS_ORIGIN` is `https://gustale.com,https://www.gustale.com`, so
   a cross-origin API call would **fail**.

> **This last point is a trap worth stating plainly:** after the
> cutover, a browser on `recipes.gustale.com` that calls
> `api.gustale.recipes` cross-origin would be blocked by CORS, because
> `CORS_ORIGIN` does not list `recipes.gustale.com`. The web app does
> not do this — it uses a **same-origin relative** `/api/*` path
> (`apps/web/src/lib/api.ts`: `API_BASE` is `""` in the browser) and
> Caddy proxies it. **That is why the new host needs its own `/api/*`
> block**, and why it has one.

---

## 4. Sitemaps, hreflang, robots.txt

### 4.1 Sitemaps

The sitemap is generated **from the build output** by
`scripts/generate_sitemaps.mjs`, so it always lists exactly the pages
that exist. The origin comes from `siteOrigin(domain)` — one function,
one string.

**At cutover the recipes sitemap origin changes to
`https://recipes.gustale.com`.** The geo one stays `https://gustale.com`.

**The counts do not change.** The recipes sitemap has **1,614** URLs:

| | count |
|---|---:|
| dishes | 1,474 |
| families | 123 |
| lineages | 12 |
| root + /dishes | 2 |
| filter pages | 3 *(the phantom parent dirs — see §8)* |

**And `scripts/check-live-sitemaps.sh` must be updated** — it currently
hardcodes `1531` and a domain list of `gustale.com gustale.recipes`:

```bash
# scripts/check-live-sitemaps.sh:47
DOMAIN_LIST=(gustale.com gustale.recipes)
#   -> DOMAIN_LIST=(gustale.com recipes.gustale.com)
```

and the expected count, which is passed as an argument from the deploy
job (`.github/workflows/ci.yml:1896`):

```bash
if ! bash "$BUILD_DIR/scripts/check-live-sitemaps.sh" 1531; then
#   -> bash "$BUILD_DIR/scripts/check-live-sitemaps.sh" 1614
```

The domain list is overridable with the `DOMAINS` env var, so the
script itself does not need editing — only the default does.

> This is the same **stale constant** that made the last deploy's
> "Real verify" fail. It is already known and already written up in
> `docs/WP-01-DEPLOY-RESULT.md` §"The CI 'Real verify' failure is the
> same root cause, twice". **Fix it as part of the cutover**, or the
> cutover deploy fails its own verify step.

### 4.2 hreflang

The hreflang alternates are built in `Layout.astro` from the same origin
value, so they change with the code in §Step 1 — **no separate work**.

But there is one thing to check: the alternates must be **reciprocal**.
The `Layout.astro` comment says so ("Reciprocal, plus `x-default`
pointing at the English URL"), and `validate-build` asserts it. After
the cutover, every locale page's alternates must point at
`recipes.gustale.com/<locale>/...`, and the geo pages' alternates must
still point at `gustale.com`.

> **Watch for this specific trap:** the recipes site and the geo site
> both have `/dishes/<slug>` pages, and the geo build serves the same
> dish pages. If the hreflang sets for the two properties are built
> from different origins, the alternates will cross-reference
> incorrectly. Verify with:
>
> ```bash
> curl -s https://recipes.gustale.com/es/dishes/bakso/ | grep -o 'hreflang="[^"]*"[^>]*href="[^"]*"'
> ```
>
> Every href must be on `recipes.gustale.com` (or `x-default`).

### 4.3 robots.txt

**There is no static robots.txt to edit.** It is **generated** by
`scripts/generate_sitemaps.mjs` (line 342 onward), from the same
`origin` value as the sitemap:

```js
const robotsPath = join(dist, "robots.txt");
...
`Sitemap: ${origin}/sitemap.xml`,
```

So changing `siteOrigin()` changes robots.txt too. **No separate work.**

> **But the title line is hardcoded**, and it names the property:
>
> ```js
> `# Gustale — ${domain === "geo" ? "Atlas (gustale.com)" : "Recipes (gustale.recipes)"}`
> ```
>
> That string needs updating too, or the recipes robots.txt will read
> *"Gustale — Recipes (gustale.recipes)"* while serving from
> `recipes.gustale.com`. Cosmetic, but a crawler-facing file should not
> name the wrong domain.

> **Do not add a `Disallow: /` to the new host** — see §1.3. The
> noindex header is the mechanism.

---

## 5. The passkey RP ID — this is the sharp edge

### 5.1 What it is today

`apps/api/src/auth.ts`:

```ts
passkey({
  rpName: "Gustale",
  rpID: env.BETTER_AUTH_URL
    ? new URL(env.BETTER_AUTH_URL).hostname
    : "gustale.com",
  origin: env.BETTER_AUTH_URL ? [env.BETTER_AUTH_URL] : undefined,
}),
```

Live `BETTER_AUTH_URL=https://api.gustale.com`, so:

> **The current passkey RP ID is `api.gustale.com`** — not
> `gustale.com`.

The owner's brief said "the passkey RP ID on gustale.com". The intent
is right; the current value is one level more specific than assumed.

### 5.2 Why it breaks

WebAuthn requires the RP ID to be equal to, or a registrable-domain
suffix of, the caller's effective domain.

| origin | eTLD+1 | RP ID `api.gustale.com` valid? |
|---|---|---|
| `api.gustale.com` | `gustale.com` | yes (== eTLD+1) |
| `gustale.recipes` | `gustale.recipes` | **no** — different registrable domain |
| `recipes.gustale.com` | `gustale.com` | **no** — `api.gustale.com` is a *sibling*, not a suffix |

`api.gustale.com` and `recipes.gustale.com` are **siblings** under
`gustale.com`. A passkey scoped to one is not usable on the other.

### 5.3 The fix, and why it is backward compatible

**Set the RP ID to `gustale.com`.**

```
rpID: "gustale.com"
```

- `gustale.com` **is** the eTLD+1 of both `api.gustale.com` and
  `recipes.gustale.com` → one RP ID covers both.
- **Existing passkeys keep working.** A credential whose RP ID is a
  registrable-domain suffix is usable on any host under that suffix,
  and `api.gustale.com` is under `gustale.com`. Nothing has to be
  re-registered.
- It is also a *relaxation*, not a tightening: it does not enable a
  passkey on a host that was not already in the `gustale.com` tree.

### 5.4 The `api.gustale.recipes` trap

`api.gustale.recipes` has eTLD+1 **`gustale.recipes`** — a *different*
registrable domain. A passkey with RP ID `gustale.com` will **not**
work there.

So the auth origin matters:

| `BETTER_AUTH_URL` | RP ID | `api.gustale.com` | `recipes.gustale.com` | `api.gustale.recipes` |
|---|---|---|---|---|
| `https://api.gustale.com` (today) | `api.gustale.com` | ✅ | ❌ | ❌ |
| → `https://api.gustale.com` + explicit `rpID: gustale.com` | `gustale.com` | ✅ | ✅ | ❌ |
| → `https://api.gustale.recipes` + `rpID: gustale.com` | `gustale.com` | ❌ | ✅ | ✅ |

> **Recommendation:** keep `BETTER_AUTH_URL=https://api.gustale.com` and
> set `rpID: "gustale.com"` explicitly. That is the only combination
> that works on **both** `api.gustale.com` and `recipes.gustale.com`,
> and it requires no change to the auth origin, no change to the
> cookie domain, and no re-registration.
>
> **Do NOT switch `BETTER_AUTH_URL` to `api.gustale.recipes`** at the
> same time — that would move the auth origin to the domain being
> retired, and it would break `api.gustale.com` logins.

### 5.5 `trustedOrigins`

The API's `trustedOrigins` list is:

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

**`https://recipes.gustale.com` must be added** or cross-origin auth
calls from the new host will be rejected.

> Note that `https://gustale.recipes` is **not** currently in the
> list, and the recipes site works — because the site and the API are
> same-origin from the browser's point of view (`/api/*` is proxied by
> Caddy). So this is belt-and-braces, but add it anyway: it costs
> nothing and it protects the case where someone calls
> `api.gustale.com` directly from the new host.

### 5.6 `CORS_ORIGIN`

Live value: `https://gustale.com,https://www.gustale.com`.

**`recipes.gustale.com` is not in it.** As in §5.5, this does not break
the site (same-origin `/api/*`), but it will break any direct
cross-origin call. **Add it:**

```
CORS_ORIGIN=https://gustale.com,https://www.gustale.com,https://recipes.gustale.com
```

> Also add `https://gustale.recipes` while the old host is still live —
> it is missing today, and it is a latent bug for anything that calls
> the API cross-origin from the old host.

### 5.7 Cookies

The auth cookie is **host-only** — `advanced.defaultCookieAttributes`
sets `sameSite: lax`, `httpOnly: true`, and no `domain` attribute. So
the session cookie is issued by whichever host the browser talked to.

Because the browser uses same-origin `/api/*`, after the cutover the
cookie is issued by `recipes.gustale.com` and works there. **No cookie
domain change is needed** — and none should be made, because a
`.gustale.com` cookie domain would make the recipe sessions readable
by the geo site.

### 5.8 The order of the auth changes

Do these **before** the 301, so there is never a window where the new
host is live and auth is broken:

1. `rpID: "gustale.com"` in `apps/api/src/auth.ts`
2. `trustedOrigins` += `https://recipes.gustale.com`
3. `CORS_ORIGIN` += `https://recipes.gustale.com`
4. deploy the API
5. verify a login **and** a passkey registration **and** a passkey
   sign-in on `recipes.gustale.com` before anything else moves

---

## 6. Search Console and Bing

### 6.1 Google Search Console

Two properties are involved:

| property | now | after |
|---|---|---|
| `gustale.recipes` | the recipes site | a 301-only site |
| `recipes.gustale.com` | not a property | the recipes site |

**Steps, in order:**

1. **Add `recipes.gustale.com` as a property** (URL-prefix, or
   Domain). Verify it **before** the redirect goes up, so the
   verification token can be served while the host is still noindex —
   it is a live host, so the token works either way.
2. **Submit the new sitemap:**
   `https://recipes.gustale.com/sitemap.xml`.
3. **Wait for the new build to be deployed and verified** (§Step 3).
4. **Turn on the 301** (§Step 4).
5. **Google's "Change of Address" tool:** Search Console → the
   `gustale.recipes` property → Settings → Change of Address.

   - *New address:* `https://recipes.gustale.com`
   - *Website migrations* tab → **URL redirects only**. Do **not**
     check "I want to move to a different domain" — that is the
     subdomain-move option and it is the wrong tool for a host swap
     inside one registrable domain.
   - Validate. Google checks a sample of URLs from both properties.

6. **Watch for 2–4 weeks:** Coverage → "Moved" pages. The goal is
   Google crawling the new host, seeing the 301, and transferring.

> **Timing matters.** The Change of Address tool wants the redirect to
> be live, and it wants the new host to be crawlable. The noindex
> header **must be removed** from the new host before or at the same
> time as the 301 — a noindex'd destination defeats the transfer.
> That is why the noindex line is marked "REMOVE THIS LINE AT
> CUTOVER" in the Caddy snippet.

### 6.2 Bing Webmaster Tools

Same shape, different spelling:

1. Add the `recipes.gustale.com` site.
2. **Tools → URL Submission → IndexNow or the sitemap** —
   `https://recipes.gustale.com/sitemap.xml`.
3. **Tools → URL Redirects / "Move to another domain"** — Bing's
   equivalent of Change of Address. Bing supports a bulk redirect map,
   so the full URL list can be submitted if a single host-level rule is
   not accepted.

> Bing's "Move to another domain" requires **every** old URL to have a
> matching new URL. A host-level `redir` with `{uri}` produces exactly
> that mapping, so it satisfies Bing's rule as long as the host-level
> rule is what is live.

### 6.3 IndexNow

If IndexNow is in use (or gets added), it is **host-specific** — the
key is bound to a host. A new host needs its own key file. Check
before cutover.

---

## 7. The rollback

### 7.1 What "roll back" means at each stage

| stage | rollback | blast radius |
|---|---|---|
| **before** the code change | nothing to do | none |
| **after** the code change, before the 301 | redeploy the previous build | minutes |
| **after** the 301 | remove the `redir`, redeploy the previous build | minutes, and the 301 is gone from Google's crawl |

### 7.2 The rollback procedure

**Step 1 — remove the redirect.** In
`/etc/caddy/sites/gustale.recipes.caddy`, delete the `redir` rule and
restore the vhost to the recipes proxy (as it is today). Reload:

```bash
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date -u +%Y%m%dT%H%M%SZ)-rollback
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
```

**Step 2 — redeploy the previous build.** `main` is the source of truth.
If the cutover was a single squash commit, `git revert` it; if the
cutover spans several commits, roll back to the pre-cutover SHA:

```bash
git log --oneline           # find the pre-cutover main
# then deploy that SHA through the normal pipeline
```

The deploy pipeline builds from `main`, so a revert commit on `main` is
the cleanest rollback — it keeps the history linear and the pipeline
untouched.

**Step 3 — restore the noindex** on `recipes.gustale.com`, so the
duplicate host does not start getting indexed while the old host
recovers. (If the noindex was already removed at cutover, put it back.)

**Step 4 — tell Search Console.** If the Change of Address was
submitted, submit a **Change of Address back** (new address =
`gustale.recipes`). Bing's equivalent is the same. Google allows
changing the destination of a Change of Address; the transfer is
reversible in the tool.

### 7.3 The pre-cutover tag

**Tag the pre-cutover `main` before starting**, the same way
`pre-wp-01` was done for the WP-01 deploy:

```bash
git tag -a pre-recipes-cutover <pre-cutover-main-sha> \
  -m "The last main before the recipes.gustale.com cutover"
```

That tag is the rollback target, and it is the answer to "which build
was live before?" months later.

### 7.4 What a rollback does NOT undo

- **Google's index.** If Google has already recrawled and transferred,
  a rollback does not put the old URLs back in the index. It takes
  another crawl cycle.
- **The Change of Address** has to be reversed in the tool.
- **Any content published to the new host** in the meantime stays there.

---

## 8. Open items — known, not yet fixed

These are **not** part of the cutover, but two of them will bite it.

### 8.1 The three phantom sitemap URLs *(will bite the cutover)*

`scripts/generate_sitemaps.mjs` has:

```js
const RESERVED = new Set(["new", "edit", "create", "search"]);
```

WP-01b added `dist/dishes/{category,region,technique}/` as the **parent
directories** of the filter pages, and the generator counts every
`dist/dishes/` subdirectory as a dish slug. So the sitemap lists three
URLs that **404**:

```
/dishes/category
/dishes/region
/dishes/technique
```

At cutover these three URLs become part of the *canonical* sitemap,
which is worse than today (today they are on a noindex host). **Fix
before the cutover** — add the three names to `RESERVED`, or better,
derive the reserved set from the actual route table.

### 8.2 The hardcoded sitemap count *(will bite the cutover)*

`scripts/check-live-sitemaps.sh 1531` is hardcoded for the pre-WP-02b
vocabulary. The live count is **1,611** (geo) and **1,614** (recipes).
The check also assumes the two domains agree; they differ by 3. **This
already fails every deploy** — see
`docs/WP-01-DEPLOY-RESULT.md`.

### 8.3 The `PUBLIC_DOMAIN` trap

`PUBLIC_DOMAIN` selects the build **variant**, not the hostname. Its
only two valid values are `geo` and `recipes`; anything else falls
through `resolveGustaleDomain`'s default and produces the *recipes*
build. Setting it to `recipes.gustale.com` would therefore produce
`recipes` — but setting it to anything unrecognised by accident is the
kind of mistake that silently ships the wrong site. **Leave it at
`recipes`.**

### 8.4 The `noindex` line

In `/etc/caddy/sites/recipes.gustale.com.caddy`:

```
X-Robots-Tag "noindex, nofollow"
```

**Remove it at cutover**, in the same change that turns on the 301.

---

## 9. The checklist, in one place

```bash
# ── pre-flight ────────────────────────────────────────────────────
curl -fsS https://gustale.recipes/            >/dev/null && echo "canonical OK"
curl -fsS https://recipes.gustale.com/        >/dev/null && echo "new host OK"
curl -fsS https://recipes.gustale.com/api/dishes?limit=1 >/dev/null && echo "api OK"
curl -fsS https://recipes.gustale.com/media/dishes/moussaka-greek/cover-800w.webp >/dev/null && echo "media OK"
scripts/smoke/run-smoke.sh --base https://recipes.gustale.com --wp WP-01
#   expect PASS 12 · FAIL 1

# ── tag the rollback target ───────────────────────────────────────
git tag -a pre-recipes-cutover <pre-cutover-main-sha> -m "..."

# ── the code change (ONE commit) ──────────────────────────────────
#   scripts/generate_sitemaps.mjs:44          siteOrigin()
#   apps/web/src/lib/domain.ts:14             RECIPES_ORIGIN
#   apps/web/src/lib/locales.ts:194           origin function
#   apps/web/src/layouts/Layout.astro:117     canonical origin
#   apps/web/src/pages/dishes/[slug].astro:152
#   apps/web/scripts/search-nav-helpers.mjs:7 RECIPES_ORIGIN
#   apps/web/scripts/browse-helpers.mjs:7      RECIPES_ORIGIN
#   apps/web/scripts/validate-build.mjs:732    origin
#   apps/web/scripts/validate-build.mjs:128,603,676,683,696  the assertions
#   scripts/generate_sitemaps.mjs:358        the robots.txt title line
#   ...plus the prose/label strings (Nav, Layout footer, siteName, titles)

# ── the auth change (ONE commit, BEFORE the 301) ──────────────────
#   apps/api/src/auth.ts                      rpID: "gustale.com"
#   apps/api/src/auth.ts                      trustedOrigins += recipes.gustale.com
#   deploy env                                CORS_ORIGIN += recipes.gustale.com
#   NOTE: keep BETTER_AUTH_URL = https://api.gustale.com

# ── deploy, then verify the new host ─────────────────────────────
curl -s https://recipes.gustale.com/dishes/bakso/ | grep -o 'rel="canonical"[^>]*'
curl -s https://recipes.gustale.com/sitemap-en.xml | head -3
curl -s https://recipes.gustale.com/es/dishes/bakso/ | grep -o 'hreflang="[^"]*"[^>]*href="[^"]*"'

# ── the 301 ───────────────────────────────────────────────────────
#   /etc/caddy/sites/gustale.recipes.caddy
#     @atlas_map path /map
#     redir @atlas_map https://gustale.com/map permanent
#     redir https://recipes.gustale.com{uri} permanent
#   ...and REMOVE the noindex from recipes.gustale.com.caddy

# ── Search Console ────────────────────────────────────────────────
#   1. add the recipes.gustale.com property
#   2. submit https://recipes.gustale.com/sitemap.xml
#   3. gustale.recipes property -> Change of Address -> new address
#      = https://recipes.gustale.com, "URL redirects only"
#   4. Bing: add the site, submit the sitemap, set up the URL redirect
```

---

## 10. The files this touches

| file | change |
|---|---|
| `apps/web/src/lib/domain.ts` | `RECIPES_ORIGIN`, `siteName()` |
| `apps/web/src/lib/locales.ts` | the origin function |
| `apps/web/src/layouts/Layout.astro` | the canonical origin, the footer links |
| `apps/web/src/pages/dishes/[slug].astro` | the origin |
| `apps/web/src/pages/ingredients/[slug].astro` | the page title |
| `apps/web/src/components/Nav.astro` | the property-switch label |
| `apps/web/src/components/design/GustaleAppIsland.tsx` | the footer caption |
| `apps/web/src/components/design/App.jsx` | the footer caption |
| `apps/web/scripts/search-nav-helpers.mjs` | `RECIPES_ORIGIN` |
| `apps/web/scripts/browse-helpers.mjs` | `RECIPES_ORIGIN` |
| `apps/web/scripts/validate-build.mjs` | the origin + 3 assertions |
| `scripts/generate_sitemaps.mjs` | `siteOrigin()` + the `RESERVED` set + the robots.txt title |
| `apps/api/src/auth.ts` | `rpID`, `trustedOrigins` |
| `scripts/check-live-sitemaps.sh` | the domain list + the count |
| `/etc/caddy/sites/gustale.recipes.caddy` | the 301 (**on the VPS**) |
| `/etc/caddy/sites/recipes.gustale.com.caddy` | remove the noindex (**on the VPS**) |
| `/etc/caddy/sites/recipe.gustale.com.caddy` | already correct (**on the VPS**) |

---

## 11. The references

| document | what it holds |
|---|---|
| `docs/READY-FOR-REDESIGN.md` | the current UI structure and the redesign risks |
| `docs/WP-01-DEPLOY-RESULT.md` | the two stale CI constants (§8.1, §8.2) |
| `docs/WP-01-DEPLOY.md` | the rollback command and the deploy checklist |
| `apps/web/src/lib/domain.ts` | the `geo`/`recipes` resolver |
| `apps/web/scripts/validate-build.mjs` | the 86 assertions that define "the design still works" |
| `apps/api/src/auth.ts` | the passkey RP ID and `trustedOrigins` |
