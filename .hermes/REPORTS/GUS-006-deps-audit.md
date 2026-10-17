# GUS-006 — Dependency vulnerability audit (Phase 0)

**Date:** 2026-10-17 · **Method:** `pnpm audit --json` against the committed `pnpm-lock.yaml` of `origin/main` (run inside `node:22-alpine` via `docker run`). Equivalent to the GitHub Security tab `Dependabot alerts`, counted per advisory in the lockfile. Re-runs land in CI (new `pnpm audit` step, non-blocking for now).

## Summary

| Severity | Total | Production | Dev-only |
|---|---|---|---|
| critical | 5 | 2 | 3 |
| high     | 37 | 36 | 1 |
| moderate | 26 | 21 | 5 |
| low      | 4 | 4 | 0 |
| **all**  | **72** | – | – |

## CRITICAL (5)

### astro — Astro: Remote code execution through AVIF image optimization

- **Severity:** critical · **CWE:** CWE-125, CWE-787 · **GHSA:** [GHSA-26w7-cxv4-gfx2](https://github.com/advisories/GHSA-26w7-cxv4-gfx2)
- **Installed:** 6.4.7  →  **Patched:** `>=7.2.8`
- **Surface:** touches production path (1 lockfile paths)

### maplibre-gl — MapLibre GL JS: XSS Sanitizer Bypass in DOM.sanitize() via Live NamedNodeMap Removal Skip

- **Severity:** critical · **CWE:** CWE-79 · **GHSA:** [GHSA-jrc7-96c5-q579](https://github.com/advisories/GHSA-jrc7-96c5-q579)
- **Installed:** 5.24.0  →  **Patched:** `>=6.4.1`
- **Surface:** touches production path (1 lockfile paths)

### vitest — When Vitest UI server is listening, arbitrary file can be read and executed

- **Severity:** critical · **CWE:** CWE-22, CWE-862 · **GHSA:** [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp)
- **Installed:** 2.1.9  →  **Patched:** `>=3.2.6`
- **Surface:** DEV-only (4 paths via dev tools — vitest, drizzle-kit, etc.)

### tinypool — Tinypool: Prototype Pollution gadget in worker options leads to Remote Code Execution

- **Severity:** critical · **CWE:** CWE-1321 · **GHSA:** [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3)
- **Installed:** 1.1.1  →  **Patched:** `>=2.1.1`
- **Surface:** DEV-only (4 paths via dev tools — vitest, drizzle-kit, etc.)

### tinypool — Tinypool: Prototype Pollution Gadget to RCE in run() options

- **Severity:** critical · **CWE:** CWE-94, CWE-1321 · **GHSA:** [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr)
- **Installed:** 1.1.1  →  **Patched:** `>=2.1.2`
- **Surface:** DEV-only (4 paths via dev tools — vitest, drizzle-kit, etc.)

## HIGH (37) — production-only listed

- **@fastify/busboy** — @fastify/busboy vulnerable to Denial of Service via oversized multipart boundary · installed `3.2.0` → patched `>=3.2.1` · [GHSA-xjh9-v7x6-24jw](https://github.com/advisories/GHSA-xjh9-v7x6-24jw)
- **@fastify/busboy** — @fastify/busboy vulnerable to Denial of Service via prototype-named multipart part header · installed `3.2.0` → patched `>=3.2.1` · [GHSA-x8mw-p69m-v3mx](https://github.com/advisories/GHSA-x8mw-p69m-v3mx)
- **astro** — Astro: Authorization Bypass via Decode Iteration Limit and Rewrite Path Canonicalization Mismatch · installed `6.4.7` → patched `>=6.4.8` · [GHSA-vj59-8hwv-xxmv](https://github.com/advisories/GHSA-vj59-8hwv-xxmv)
- **better-auth** — Better Auth: Account takeover via pre-account hijacking on magic-link and email-OTP sign-in · installed `1.6.18` → patched `>=1.6.22` · [GHSA-qq9h-g4jm-xgf3](https://github.com/advisories/GHSA-qq9h-g4jm-xgf3)
- **browserslist** — Browserslist: Unbounded memory growth (no cache eviction) via distinct query results, leading to eventual OOM · installed `4.28.2` → patched `>=4.28.7` · [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx)
- **browserslist** — Browserslist: Uncaught crash / prototype write via untrusted browserslist-stats.json custom stats (normalizeStats) · installed `4.28.2` → patched `>=4.28.7` · [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g)
- **devalue** — devalue: `stringify`/`uneval` serialize shared memory · installed `5.8.1` → patched `>=5.9.3` · [GHSA-j22f-vq7h-c4qm](https://github.com/advisories/GHSA-j22f-vq7h-c4qm)
- **devalue** — devalue: Repeated primitive strings cause quadratic expansion in uneval · installed `5.8.1` → patched `>=5.9.3` · [GHSA-mcm9-63f2-9j32](https://github.com/advisories/GHSA-mcm9-63f2-9j32)
- **devalue** — devalue: stringifyAsync can cause an unhandled rejection despite a caught returned promise · installed `5.8.1` → patched `>=5.9.3` · [GHSA-x5rw-q4pp-hg5g](https://github.com/advisories/GHSA-x5rw-q4pp-hg5g)
- **devalue** — devalue: Custom ArrayBuffer revivers can bypass typed-array allocation validation · installed `5.8.1` → patched `>=5.9.3` · [GHSA-r9w8-h9r3-54w4](https://github.com/advisories/GHSA-r9w8-h9r3-54w4)
- **fast-uri** — fast-uri vulnerable to host confusion via literal backslash authority delimiter · installed `3.1.2` → patched `>=3.1.4` · [GHSA-v2hh-gcrm-f6hx](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx)
- **fast-uri** — fast-uri vulnerable to host confusion via backslash authority introducer · installed `3.1.2` → patched `>=3.1.5` · [GHSA-7p8r-x3mc-p8w7](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7)
- **fast-uri** — fast-uri vulnerable to server-side request forgery via malformed IPv6 normalization · installed `3.1.2` → patched `>=3.1.6` · [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc)
- **fast-uri** — fast-uri vulnerable to server-side request forgery via repeated hostname percent-decoding · installed `3.1.2` → patched `>=3.1.6` · [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf)
- **fast-uri** — fast-uri vulnerable to host confusion via percent-encoded scheme normalization · installed `3.1.2` → patched `>=3.1.6` · [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp)
- **fast-uri** — fast-uri vulnerable to host confusion via failed IDN canonicalization · installed `3.1.2` → patched `>=3.1.3` · [GHSA-4c8g-83qw-93j6](https://github.com/advisories/GHSA-4c8g-83qw-93j6)
- **fast-uri** — fast-uri vulnerable to authority injection via an unvalidated port in serialize · installed `3.1.2` → patched `>=3.1.7` · [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3)
- **fastify** — fastify vulnerable to request body replacement via an async validation result collision · installed `5.8.5` → patched `>=5.12.2` · [GHSA-667r-xxjv-c9mm](https://github.com/advisories/GHSA-667r-xxjv-c9mm)
- **fastify** — fastify vulnerable to authentication bypass via malformed URLs reaching encapsulated not-found handlers · installed `5.8.5` → patched `>=5.12.2` · [GHSA-p68q-wchp-6fh7](https://github.com/advisories/GHSA-p68q-wchp-6fh7)
- **fastify** — fastify vulnerable to request validation bypass via skipped boolean false schemas · installed `5.8.5` → patched `>=5.12.2` · [GHSA-hwr6-493r-vm6h](https://github.com/advisories/GHSA-hwr6-493r-vm6h)
- **fastify** — fastify vulnerable to header validation bypass via incomplete schema case normalization · installed `5.8.5` → patched `>=5.12.2` · [GHSA-9q9j-q6p8-xq58](https://github.com/advisories/GHSA-9q9j-q6p8-xq58)
- **find-my-way** — find-my-way: DDoS with HTTP2 · installed `9.6.0` → patched `>=9.6.1` · [GHSA-c96f-x56v-gq3h](https://github.com/advisories/GHSA-c96f-x56v-gq3h)
- **http-cache-semantics** — http-cache-semantics max-stale handling can disclose cross-user cached responses · installed `4.2.0` → patched `>=4.2.1` · [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
- **js-yaml** — js-yaml: YAML merge-key chains can force quadratic CPU consumption · installed `4.2.0` → patched `>=4.3.0` · [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m)
- **js-yaml** — JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x) — CVE-2026-59870 fix not backported · installed `4.2.0` → patched `>=4.3.1` · [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj)
- **js-yaml** — js-yaml: maxTotalMergeKeys does not limit CPU use for empty merge sources · installed `4.2.0` → patched `>=4.3.2` · [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh)
- **nanoid** — nanoid: non-secure generators can loop indefinitely with negative size · installed `3.3.12` → patched `>=3.3.16` · [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv)
- **nanoid** — nanoid: custom generators can loop indefinitely when size is zero · installed `3.3.12` → patched `>=3.3.18` · [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8)
- **postcss** — PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure · installed `8.5.15` → patched `>=8.5.18` · [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849)
- **sharp** — sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 · installed `0.34.5` → patched `>=0.35.0` · [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)
- **sharp** — sharp: Vulnerabilities in libheif: GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545 · installed `0.34.5` → patched `>=0.35.4` · [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)
- **sharp** — sharp : Vulnerability in librsvg dependency CVE-2026-96889 · installed `0.34.5` → patched `>=0.35.5` · [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)
- **smol-toml** — smol-toml: Denial of Service via malformed TOML documents · installed `1.6.1` → patched `>=1.7.1` · [GHSA-7w5x-hrqm-74c2](https://github.com/advisories/GHSA-7w5x-hrqm-74c2)
- **source-map-js** — source-map-js allows event-loop denial of service through indexed source-map section offsets · installed `1.2.1` → patched `>=1.2.2` · [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
- **svgo** — SVGO removeScripts plugin leaves some executable scripts intact · installed `4.0.1` → patched `>=4.0.2` · [GHSA-2p49-hgcm-8545](https://github.com/advisories/GHSA-2p49-hgcm-8545)
- **svgo** — SVGO: removeScripts allows executable links through namespace and control-character bypasses · installed `4.0.1` → patched `>=4.1.0` · [GHSA-w27v-7q3p-w38r](https://github.com/advisories/GHSA-w27v-7q3p-w38r)

(1 additional HIGH is dev-only.)

## Triage / sequence

1. **GUS-006.a (this PR cycle):** critical prod (2) — fix in this same audit + via PRs #59 and #60 (dependabot already opened them). Critical dev (3) — fix in a follow-up once vitest/tinypool are scoped.
2. **GUS-006.b:** high prod (36) — small PRs grouped by direct dep + `pnpm.overrides` for transitives. Track one PR per logical cluster.
3. **GUS-006.c:** moderate prod (24) — fix opportunistically with each cluster PR.
4. **GUS-006.d:** add `.github/dependabot.yml` for weekly grouped updates + `pnpm audit --audit-level=critical` as a non-blocking CI step; promote to blocking once criticals reach 0.

## Reproducing

```bash
mkdir -p /tmp/audit && git archive origin/main package.json pnpm-lock.yaml pnpm-workspace.yaml "apps/*/package.json" "packages/*/package.json" | tar x -C /tmp/audit
docker run --rm -v /tmp/audit:/w -w /w node:22-alpine sh -c "corepack enable; pnpm install --frozen-lockfile; pnpm audit --json" > audit.json
```
