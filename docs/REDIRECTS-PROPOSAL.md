# The 301 redirects — the mechanism and where the map lives

**Status: proposal. Nothing has been changed.**

## THE CONSTRAINT THAT DECIDES IT

**The site ships as a fully static Astro build.** `apps/web/astro.config.mjs`
has no `output: "server"` and no adapter — just `integrations: [react()]`.
Caddy serves the static files.

That has one consequence that rules out the obvious answer:

> **`apps/web/src/middleware.ts` CANNOT serve a runtime 301.** The
> middleware exists and does real work (the /admin and /dashboard role
> gates), but its own header says it plainly: *"the site ships as a
> fully-static Astro build (no SSR adapter), so this middleware runs only
> during `astro build`."* A redirect emitted at build time would be baked
> into a static file — it would only ever fire for a page that was
> prerendered, which is not what a redirect for an OLD url is.

## THE THREE OPTIONS

### Option A — Caddy `redir` (RECOMMENDED)

Caddy has a first-class `redir` directive, and it is already the thing in
front of every request:

```caddy
redir /lineages/chili-condiment /families 301
```

**Why Caddy is the right place:**

- it is the only component that sees EVERY request, including ones that
  match no static file. Astro's prerendered 404 page does not.
- a 301 is an HTTP-level statement. The web server is where HTTP
  responses live.
- it costs nothing at request time — no application, no database, no
  lookup.

**The problem, and it is a real one:** the Caddyfile is **NOT deployed by
CI**. `.github/workflows/ci.yml` never references it, and the host's
`/etc/caddy/Caddyfile` (10.7 KB, dated Aug 18) has **diverged** from the
repo's `infra/prod/Caddyfile` (4.0 KB, dated Oct 29). The host file is
hand-edited.

So a redirect added to the repo's Caddyfile would not reach production.

**That makes this option's cost: the Caddyfile needs to come under
management.** Which is worth doing anyway — a hand-edited proxy config
that has drifted from its repo copy is a risk, and it already contains
the site-blocking rules.

### Option B — a static `redirects` map in the web build

Astro emits static HTML files. A redirect can be expressed as a static
file at the old path containing a `<meta http-equiv="refresh">`, or as a
`301` via a static-hosting adapter.

**Astro has a `redirects` config** in `astro.config.mjs`:

```js
redirects: {
  "/lineages/chili-condiment": "/families",
}
```

Astro generates a real redirect page for each entry at build time.

**Why this is attractive:**

- the map lives **in the repo, in the web app, next to the routes it
  redirects**. It is versioned, reviewable, and it deploys with the site
  automatically — no CI change, no host access.
- it is one file next to `src/pages/`, where someone changing a route
  will see it.

**Why it is not a true 301 in every case:** the redirect is emitted as an
HTML page. Whether the response is a `301` or a `200` with a meta-refresh
depends on the adapter and the server. **Caddy would serve the static
file as a 200**, and the meta-refresh would do the redirect in the
browser. For SEO that is materially worse than a real 301 — the search
engine follows the meta-refresh, but it is not the same signal, and a
crawler that does not execute JavaScript or honour meta-refresh sees a
200 with no content.

**This is the honest tradeoff: Option B is simpler to deploy and weaker
as a redirect.**

### Option C — the API

The API is a Fastify app and it could serve redirects. But it is
proxied at `/api/*` only, so `/lineages/...` never reaches it. Making it
work would mean routing the whole site through the API, which is a
massive change for a redirect map.

**Rejected.**

## THE RECOMMENDATION

**Option A (Caddy `redir`), and bring the Caddyfile under management in
the same PR.**

The redirect map lives in the Caddyfile, in the web host's block, because:

1. a 301 is an HTTP response, and Caddy is the HTTP server;
2. it works for every request, including the ones that match no file;
3. it is the only option that produces a **real 301** — which is what
   "a 301 redirect" means.

**But the map should NOT be hand-written into a hand-edited file.** The
proposal is:

- the **map** lives in the repo, in one place — `infra/prod/redirects.caddy`
  or a small JSON/YAML file that generates the Caddy block;
- a **generator** turns it into the Caddy snippet;
- the **deploy** copies the host Caddyfile into the repo (or the repo
  file into the host), adds the generated block, and reloads Caddy;
- the deploy **verifies** each redirect with a curl, so a broken map fails
  the deploy rather than shipping.

That is more machinery than the redirect map itself needs today. If the
redirect list is small — and it is, see below — a simpler version is
honest:

- the map is a **single file in the repo**: `infra/prod/redirects.txt`,
  one `from to` pair per line;
- the **Caddyfile** gets a `redir` block that is generated from it, and a
  CI step checks that the generated block matches the committed Caddyfile
  (so they cannot drift);
- the deploy copies the Caddyfile to the host and reloads Caddy.

**The minimum viable version is: the map file in the repo, the generated
Caddy block, and a CI check that they agree.** That gets the redirects
deployed by CI, which is the part that is currently missing.

## WHERE THE MAP LIVES

`infra/prod/redirects.txt`, next to the Caddyfile it feeds, because the
Caddyfile is the thing that consumes it and the two must not drift.

**Not** in the web app: the web app cannot emit a real 301 from a static
build, so a map there would be a map of meta-refreshes pretending to be
redirects.

## THE REDIRECTS THEMSELVES — WHAT NEEDS ONE

The old lineage pages. There are **14** legacy lineages in the database
and they have their own URLs today:

```
/lineages/chili-condiment      /lineages/curry-spiced-stew
/lineages/fermented-batter     /lineages/fermented-bean
/lineages/filled-dough         /lineages/flatbread
/lineages/fried-dough-pastry   /lineages/noodle-soup
/lineages/preserved-fish       /lineages/rice-pilaf
/lineages/skewered-grilled-meat /lineages/stuffed-leaves
/lineages/stuffed-pasta        /lineages/wrapped-leaf
```

**These pages still exist and still work** — `/lineages` is now "History &
connections" in the new navigation, and `/lineages/[slug]` is a real
page. So they are not broken URLs and they do not need redirects.

What they DO need is the question the user asked: the old LINEAGE URLs
should point at the new PLACES and FAMILIES, because "Chili Sauces and
Condiments" as a lineage is now a place or a family in the atlas.

That is a **semantic** decision, not a mechanical one:

| old lineage | the new home | a judgment call? |
|---|---|---|
| `/lineages/flatbread` | `/families` (flatbread is a family) | maybe — is there a `/family/flatbread`? |
| `/lineages/noodle-soup` | `/families` (noodle soup is a family) | maybe |
| `/lineages/rice-pilaf` | `/families` (rice is a family) | maybe |
| `/lineages/preserved-fish` | `/families` | maybe |
| `/lineages/filled-dough` | `/families` (dumpling) | **yes** — "filled dough across Eurasia" is broader than the dumpling family |
| `/lineages/chili-condiment` | `/places/mexico`? | **yes** — is it a place or a family? |
| `/lineages/fermented-batter` | `/families` | maybe |
| `/lineages/skewered-grilled-meat` | `/families` | maybe |

**A lineage is a CROSS-CUTTING THREAD — it can cut across several places
and several families.** Mapping it to one place is usually wrong, and
mapping it to one family is usually wrong too. The honest target for most
of them is the page that explains what they are: the families index, or
the places index.

**THE DATA SAYS SO.** Each legacy lineage's dishes, and the distinct
places and families they touch (live):

| lineage | dishes | places | families |
|---|---|---|---|
| chili-condiment | 2 | 4 | 2 |
| curry-spiced-stew | 6 | 12 | 2 |
| fermented-batter | 1 | 3 | 1 |
| fermented-bean | 2 | 4 | 1 |
| filled-dough | 4 | 8 | 2 |
| flatbread | 2 | 3 | 2 |
| fried-dough-pastry | 1 | 2 | 0 |
| noodle-soup | 4 | 5 | 2 |
| preserved-fish | 0 | 0 | 0 |
| rice-pilaf | 6 | 12 | 2 |
| skewered-grilled-meat | 2 | 4 | 2 |
| stuffed-leaves | 2 | 4 | 2 |
| stuffed-pasta | 2 | 4 | 2 |
| wrapped-leaf | 0 | 0 | 0 |

**Not one lineage maps to a single place.** The busiest two — curry-spiced-stew
and rice-pilaf — reach 12 distinct places each. Two lineages
(preserved-fish, wrapped-leaf) have no dishes at all.

So "redirect each lineage to its place" is not available as a rule. The
target has to be the page that now owns the IDEA — the families index or
the places index — unless a specific single target is chosen deliberately
for a particular lineage.

**My proposal for the map:** each old lineage URL 301s to the page that
now OWNS that idea — `/families` or `/places` — with the old lineage's
own page still reachable but demoted to a historical note. Where a lineage
maps cleanly to exactly one place or family, it goes there instead.

**I need the user's call on which**, because it is a content decision, and
a wrong 301 is worse than no 301.

## THE OTHER LEGACY URLS

There are also the old `/regions` and `/concepts` paths. `/regions` still
exists — it is now labelled "Places" in the navigation — so it needs no
redirect, only the label, which is done.

## WHAT I NEED FROM YOU

1. **Caddy or the static build?** (Caddy gives a real 301; the static
   build gives a meta-refresh and a 200)
2. **If Caddy** — is bringing the Caddyfile under CI management in scope
   for this PR, or a separate one?
3. **The map's targets** — each of the 14 lineages to `/families`,
   `/places`, or a specific page?
4. **A 404 for anything not in the map**, which is the current behaviour.
   Should there be a catch-all that 301s to the browse page instead?
