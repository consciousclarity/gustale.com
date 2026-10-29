# GUS-006 — Dependency vulnerability audit (Phase 0)

**Date:** 2026-10-17 · **Method:** `pnpm audit --prod --json` against the committed `pnpm-lock.yaml` of `origin/main` (run inside `node:22-alpine` via `docker run`). Same data as the GitHub Security tab's Dependabot alerts, restricted to production dependencies. Re-runs land in CI (new `pnpm audit --audit-level=critical` step, non-blocking for now).

**This report is the production-only view.** It was previously written from a non-prod `pnpm audit --json`; the counts below come from `pnpm audit --prod` against current `main` (verified after the day-1 Dependabot merges).

## Summary

| Severity | Total | Production | Dev-only |
|---|---|---|---|
| critical | 0  | 0  | 0  |
| high     | 26 | 26 | 0  |
| moderate | 16 | 15 | 1  |
| low      | 3  | 3  | 0  |
| **all**  | **45** | – | – |

All five critical advisories that existed on `main` at 2026-10-17 13:30Z are now closed on `main` (the `pnpm audit --audit-level=critical` step in CI returns 0):

| Package | GHSAs closed by | PR |
|---|---|---|
| maplibre-gl (XSS bypass) | GHSA-jrc7-96c5-q579 | #59 (6.4.1) |
| astro (AVIF RCE) | GHSA-26w7-cxv4-gfx2 | #60 (7.2.8) |
| vitest (UI RCE) | GHSA-5xrq-8626-4rwp | #58 (4.1.11) |
| tinypool (worker RCE, transitive of vitest) | GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr | #58 + #87 (lockfile regen) |

## HIGH (26) — all production

These are the items GUS-006.b must close. Clustered by direct dep; some are pulled in transitively.

### Cluster 1 — fastify 5.8.5 → 5.12.2 (4 advisories)
- **fastify** — request body replacement via async validation result collision · installed `5.8.5` → patched `>=5.12.2` · [GHSA-667r-xxjv-c9mm](https://github.com/advisories/GHSA-667r-xxjv-c9mm)
- **fastify** — authentication bypass via malformed URLs reaching encapsulated not-found · [GHSA-p68q-wchp-6fh7](https://github.com/advisories/GHSA-p68q-wchp-6fh7)
- **fastify** — request validation bypass via skipped boolean false schemas · [GHSA-hwr6-493r-vm6h](https://github.com/advisories/GHSA-hwr6-493r-vm6h)
- **fastify** — header validation bypass via incomplete schema case normalization · [GHSA-9q9j-q6p8-xq58](https://github.com/advisories/GHSA-9q9j-q6p8-xq58)

### Cluster 2 — fast-uri 3.1.2 → 3.1.7 (6 advisories, transitive of fastify)
- **fast-uri** — host confusion via literal backslash authority delimiter · installed `3.1.2` → patched `>=3.1.4` · [GHSA-v2hh-gcrm-f6hx](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx)
- **fast-uri** — host confusion via backslash authority introducer · patched `>=3.1.5` · [GHSA-7p8r-x3mc-p8w7](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7)
- **fast-uri** — server-side request forgery via malformed IPv6 normalization · patched `>=3.1.6` · [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc)
- **fast-uri** — SSRF via repeated hostname percent-decoding · patched `>=3.1.6` · [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf)
- **fast-uri** — host confusion via percent-encoded scheme normalization · patched `>=3.1.6` · [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp)
- **fast-uri** — host confusion via failed IDN canonicalization · patched `>=3.1.3` · [GHSA-4c8g-83qw-93j6](https://github.com/advisories/GHSA-4c8g-83qw-93j6)
- **fast-uri** — authority injection via unvalidated port in serialize · patched `>=3.1.7` · [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3)

### Cluster 3 — find-my-way 9.6.0 → 9.6.1 (transitive of fastify)
- **find-my-way** — DDoS with HTTP/2 · installed `9.6.0` → patched `>=9.6.1` · [GHSA-c96f-x56v-gq3h](https://github.com/advisories/GHSA-c96f-x56v-gq3h)

### Cluster 4 — @fastify/busboy 3.2.0 → 3.2.1 (transitive of fastify)
- **@fastify/busboy** — DoS via oversized multipart boundary · installed `3.2.0` → patched `>=3.2.1` · [GHSA-xjh9-v7x6-24jw](https://github.com/advisories/GHSA-xjh9-v7x6-24jw)
- **@fastify/busboy** — DoS via prototype-named multipart part header · patched `>=3.2.1` · [GHSA-x8mw-p69m-v3mx](https://github.com/advisories/GHSA-x8mw-p69m-v3mx)

### Cluster 5 — devalue 5.8.1 → 5.9.3 (transitive of astro)
- **devalue** — `stringify`/`uneval` serialize shared memory · installed `5.8.1` → patched `>=5.9.3` · [GHSA-j22f-vq7h-c4qm](https://github.com/advisories/GHSA-j22f-vq7h-c4qm)
- **devalue** — repeated primitive strings cause quadratic expansion in uneval · [GHSA-mcm9-63f2-9j32](https://github.com/advisories/GHSA-mcm9-63f2-9j32)
- **devalue** — `stringifyAsync` unhandled rejection despite caught promise · [GHSA-x5rw-q4pp-hg5g](https://github.com/advisories/GHSA-x5rw-q4pp-hg5g)
- **devalue** — custom ArrayBuffer revivers can bypass typed-array validation · [GHSA-r9w8-h9r3-54w4](https://github.com/advisories/GHSA-r9w8-h9r3-54w4)

### Cluster 6 — js-yaml 4.2.0 → 4.3.2 (transitive of astro / drizzle-kit)
- **js-yaml** — YAML merge-key chains can force quadratic CPU · installed `4.2.0` → patched `>=4.3.0` · [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m)
- **js-yaml** — quadratic CPU in `!!omap` resolution (3.x and 4.x) · patched `>=4.3.1` · [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj)
- **js-yaml** — `maxTotalMergeKeys` does not limit CPU for empty merge sources · patched `>=4.3.2` · [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh)

### Cluster 7 — better-auth 1.6.18 → 1.6.22
- **better-auth** — account takeover via pre-account hijacking on magic-link / email-OTP · installed `1.6.18` → patched `>=1.6.22` · [GHSA-qq9h-g4jm-xgf3](https://github.com/advisories/GHSA-qq9h-g4jm-xgf3)

### Cluster 8 — browserslist 4.28.2 → 4.28.7
- **browserslist** — unbounded memory growth (no cache eviction) · installed `4.28.2` → patched `>=4.28.7` · [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx)
- **browserslist** — uncaught crash / prototype write via untrusted browserslist-stats.json · patched `>=4.28.7` · [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g)

### Cluster 9 — smol-toml 1.6.1 → 1.7.1
- **smol-toml** — DoS via malformed TOML documents · installed `1.6.1` → patched `>=1.7.1` · [GHSA-7w5x-hrqm-74c2](https://github.com/advisories/GHSA-7w5x-hrqm-74c2)

### Cluster 10 — source-map-js 1.2.1 → 1.2.2
- **source-map-js** — event-loop DoS via indexed source-map section offsets · installed `1.2.1` → patched `>=1.2.2` · [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)

## Triage / sequence

1. **GUS-006.a (done, day-1):** 5 critical advisories closed via PRs #58, #59, #60 + lockfile regen #87. CI now runs `pnpm audit --audit-level=critical` (non-blocking) — returns 0.
2. **GUS-006.b (next):** 26 HIGH prod advisories in 10 logical clusters. Order: fastify (cluster 1-4) first because they are the framework the API runs on, then better-auth (auth security), then the rest in small per-cluster PRs. One PR per cluster, plus `pnpm.overrides` for transitives (fast-uri, find-my-way, @fastify/busboy, devalue, js-yaml) so a single bump covers multiple GHSAs.
3. **GUS-006.c:** 15 HIGH-prod moderate + 3 low — fix opportunistically alongside each cluster PR.

## Reproducing

```bash
mkdir -p /tmp/audit && git archive origin/main package.json pnpm-lock.yaml pnpm-workspace.yaml "apps/*/package.json" "packages/*/package.json" | tar x -C /tmp/audit
docker run --rm -v /tmp/audit:/w -w /w node:22-alpine sh -c "corepack enable; pnpm install --frozen-lockfile; pnpm audit --prod --json" > audit.json
```

`--prod` is required to get the production-only view; `pnpm audit` (no flag) includes dev-only deps and inflates the count.
