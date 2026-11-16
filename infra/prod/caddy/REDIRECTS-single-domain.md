# The single-domain redirects — PR 2 of the gustale.com cutover

**Status: the files are written and verified. Nothing has been applied to
any server.**

`gustale.com` is the only domain. The three retired hosts answer with a
**301** and nothing else.

---

## 1. The rule table

This is the contract. Every row is asserted by
`scripts/verify-redirect-rules.sh` against a real Caddy.

| request | 301 target |
|---|---|
| `/` | `https://gustale.com/recipes` |
| `/recipes`, `/recipes/` | `https://gustale.com/recipes` |
| `/recipes/<slug>` | `https://gustale.com/recipes/<slug>` — **never** `/recipes/recipes` |
| `/dishes/<slug>` | `https://gustale.com/dishes/<slug>#recipes` |
| `/dishes/new` | `https://gustale.com/dishes/new` — **no** fragment |
| `/ingredients…`, `/login`, `/account`, `/dashboard` | the same path on `gustale.com` |
| `/<locale>/…` | the same path on `gustale.com` |
| anything else | `https://gustale.com{uri}` |
| `/api/*` | **PROXIED** → `127.0.0.1:4000` — never a 301 |
| `/media/*` | **PROXIED** → `127.0.0.1:9000`, `uri replace /media/ /gustale-public/ 1` |

---

## 2. The hosts

| host | file |
|---|---|
| `gustale.recipes`, `www.gustale.recipes` | `infra/prod/caddy/sites/gustale.recipes.caddy` |
| `recipes.gustale.com` | `infra/prod/caddy/sites/recipes.gustale.com.caddy` |
| `recipe.gustale.com` (singular — the typo) | `infra/prod/caddy/sites/recipe.gustale.com.caddy` |

**One host per file.** Caddy refuses to start when two imported files
declare the same host, and the VPS keeps one file per vhost in
`/etc/caddy/sites/` with the Caddyfile importing them by name.

The rules are identical across the files. They are kept in step by the
verification script, which exercises **all three** against a real Caddy
and fails if they diverge.

### What changed on `recipes.gustale.com`

It used to **serve** the recipes site, with an `X-Robots-Tag: noindex`
header. That block is **deleted, not edited**.

A 301 does the job better than a noindex:

* a **noindex** says *"do not list this page, but send the reader
  here"* — the canonical host keeps its ranking and the duplicate still
  competes with it;
* a **301** says *"this URL has MOVED"* — which is the truth after the
  cutover, and it transfers the ranking to the new URL.

### What changed on `recipe.gustale.com` (singular)

It pointed at `recipes.gustale.com`. It now points at `gustale.com`,
which is the canonical host and does not redirect.

**It was also dropping the path.** The registrar's redirect service
answers for this host today (its A record points at
`15.197.162.184`, not at the VPS), and it collapses every deep link
onto the homepage:

```
recipe.gustale.com/                       -> 301  https://recipes.gustale.com/
recipe.gustale.com/recipes/moussaka-greek -> 301  https://recipes.gustale.com/
recipe.gustale.com/dishes/moussaka-greek  -> 301  https://recipes.gustale.com/
```

Measured on 2026-11-16. Serving it ourselves fixes that, once the
owner points the A record at the VPS.

---

## 3. The one-hop guarantee

Every `Location` points **directly at `gustale.com`**, which does not
redirect. No rule points at another redirect host, so there is never a
chain.

This matters in one place that is easy to get wrong: `recipe.gustale.com`
used to point at `recipes.gustale.com`, which becomes a redirect host
itself after the cutover. Left alone, that would be a **two-hop** chain
— slow, breaks cached links, and leaks the referrer through the
intermediate.

The verification script asserts it end to end: one 301, then a 200.

---

## 4. The `/api/*` and `/media/*` exception

**These are proxied, not redirected, until 2027-02-14.**

* **Removal date: 2027-02-14** — 90 days after the cutover on
  2026-11-16.
* On that date, remove the `/api/*` and `/media/*` blocks from all
  three files.

### Why they are not redirected

**A 301 on a POST loses the write.** A client that follows a 301 on a
POST re-issues it as a GET, or drops it — so a login, a dish edit or a
publish would silently become a read. The API is one container on one
port for both domains and always has been, so proxying it here is a
continuation rather than a change.

**A 301 on a cover image is a wasted round trip** on every image on
every page. The `/media/*` proxy carries the same bucket rewrite
(`/media/<key>` → `/gustale-public/<key>`) that `gustale.com` uses.

The `/media/*` proxy is restricted to `GET` and `HEAD`. Anything else
under `/media` gets a 404, as today — a listing or a write is not a
read.

### An exception without an expiry becomes permanent

That is why the date is in this note, in the comment blocks of all
three files, and in the verification script's expectations.

---

## 5. The three Caddy behaviours that break these rules

Each was found by **running a real Caddy** and reading the `Location`
headers back. None is visible in the config file.

### 5.1 `redir` is a TERMINAL HANDLER, not a matcher

Several `redir` directives in one site block do **not** fall through.
The **first** one answers **every** request — `/login` would redirect
to whatever the first rule pointed at.

Every rule therefore lives in its own `handle` with its own matcher, and
the matchers are mutually exclusive.

### 5.2 `redir` does NOT expand regexp captures

`{http.regexp.1}` comes out **literally** in the `Location` header.
The slug is captured by a `rewrite` to a named placeholder instead:

```caddy
@recipe_slug {
    path /recipes/*
    not path /recipes/
}
handle @recipe_slug {
    rewrite * /recipes/{re.slug}
    redir https://gustale.com{uri} permanent
}
```

### 5.3 `{uri}` ALREADY CONTAINS THE QUERY STRING

`{uri}` expands to `http.request.uri`, which is Go's
`req.URL.RequestURI()` — **path plus query**. Appending `{?query}` to it
**doubles** the query.

Confirmed from the Caddy source, not from memory:

```
caddyconfig/httpcaddyfile/shorthands.go
    "uri"   -> http.request.uri
    "path"  -> http.request.uri.path
    "query" -> http.request.uri.query
modules/caddyhttp/replacer.go
    http.request.uri -> req.URL.RequestURI()   // path + query
```

So `{uri}` is what carries the query across in the path-preserving
rules, and `{?query}` is used **only** where the target is a literal
path (`/recipes`) and there is no `{uri}` to carry it.

> The previous version of `recipe.gustale.com.caddy` said the opposite
> — *"the explicit `{uri}` is not needed and would drop the query
> string"*. That was backwards, and the file's comment now says so and
> explains why.

### 5.4 A `/*` matcher swallows its special case

`path /recipes/*` also matches `/recipes/` with an **empty** capture,
and `path /dishes/*` also matches `/dishes/new`. Both need their own
rule, declared **and used** before the general one.

---

## 6. How the rules are verified

```bash
bash scripts/verify-redirect-rules.sh
```

It starts a throwaway Caddy in Docker, points it at **the repo's
files**, exercises every rule, and prints a PASS/FAIL table. It
touches nothing on the production server.

**89 assertions, 89 passed.** They cover every path class — root,
index, slug, the special case, locale, query, catch-all — on **all four
hosts**, plus the `/api/*` and `/media/*` exceptions (including that a
**POST** is not 301'd) and the one-hop guarantee.

The full rule table is asserted against each of the three cutover
hosts, so a file that drifted from the others fails here rather than
shipping.

### The stale-container trap

`docker run -p <port>:80` does **not** fail when another container
already holds `<port>`. Docker reports a bind error and exits, and the
port keeps serving the *other* container's config.

That is worse than no container: the test runs, it gets answers, and
those answers come from a config that is not the one under test. It
looks like a rule failure and it is not.

The script now checks that its own container is the one serving, and
names the holder if it is not.

---

## 7. The verification commands to run after applying

Run these on the VPS after the files are installed and Caddy has
reloaded.

### The root

```bash
curl -I https://gustale.recipes/
curl -I https://www.gustale.recipes/
curl -I https://recipes.gustale.com/
```

### `/recipes` and `/recipes/`

```bash
curl -I https://gustale.recipes/recipes
curl -I https://gustale.recipes/recipes/
curl -I https://recipes.gustale.com/recipes
```

### `/recipes/<slug>` — must not double the segment

```bash
curl -I https://gustale.recipes/recipes/bakso
curl -I https://www.gustale.recipes/recipes/bakso
curl -I https://recipes.gustale.com/recipes/bakso
```

### `/dishes/<slug>` — the fragment must be in `Location`

```bash
curl -I https://gustale.recipes/dishes/bakso
curl -I https://recipes.gustale.com/dishes/bakso
```

### The same-path routes

```bash
curl -I https://gustale.recipes/ingredients/salt
curl -I https://gustale.recipes/dishes/new
curl -I https://gustale.recipes/login
curl -I https://gustale.recipes/account
curl -I https://gustale.recipes/dashboard
```

### The locale case

```bash
curl -I https://gustale.recipes/es/dishes/bakso
curl -I https://recipes.gustale.com/es/dishes/bakso
```

### The catch-all, and query preservation

```bash
curl -I 'https://gustale.recipes/families?region=indonesia'
curl -I 'https://recipes.gustale.com/recipes/bakso?x=1'
```

### The exceptions — these must **not** be 301

```bash
curl -I https://gustale.recipes/api/dishes?limit=1
curl -I https://gustale.recipes/media/dishes/moussaka-greek/cover-800w.webp
curl -I -X POST -H 'Content-Type: application/json' -d '{}' \
  https://gustale.recipes/api/dishes
```

### One hop, then 200

```bash
curl -IL https://gustale.recipes/recipes/bakso
```

### The singular typo host

```bash
curl -I https://recipe.gustale.com/dishes/bakso
```

---

## 8. What to do with the domains themselves

**Keep them registered.**

A registered domain that 301s is a domain that can be brought back. An
unregistered one returns the registrar's parking page, which is a worse
answer than a redirect — and the TLS certificates and the DNS records
that make these redirects work depend on the registrations existing.

Do **not** point them at anything else. They resolve to the VPS and
answer with the 301 above.

---

## 9. The order of operations

```
PR 1 live and verified  ->  PR 2 redirects live  ->  remove the recipes
web container and its CI matrix entry
```

**PR 2 must not go live before PR 1.** Until `gustale.com` serves
`/recipes` and `/ingredients`, a redirect to it sends readers to a 404.

**The recipes web container is not removed by PR 2.** It keeps serving
the old host until the owner removes it, and removing it before the
redirects are in place would make every old URL a 404.

---

## 10. Installing the files

On the VPS:

```bash
cp /etc/caddy/sites/gustale.recipes.caddy      /etc/caddy/sites/gustale.recipes.caddy.bak
cp /etc/caddy/sites/recipes.gustale.com.caddy   /etc/caddy/sites/recipes.gustale.com.caddy.bak
cp /etc/caddy/sites/recipe.gustale.com.caddy    /etc/caddy/sites/recipe.gustale.com.caddy.bak
```

Install the three files from this repo, then:

```bash
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
```

`caddy validate` proves the config **parses**. It proves nothing about
what the `Location` header will say — the `curl` commands in §7 are
what prove that.
