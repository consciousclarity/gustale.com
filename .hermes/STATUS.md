# Gustale — status (rolling)

**2026-10-16 handover → PR #61 merged → 30 branches deleted (R1+R2) → 5 archive tags pushed for wrongly-deleted closed-not-merged branches.**
Live: gustale.com 200, gustale.recipes 200, api /health 200. Running image `073d7f90…` on all 3 containers. main HEAD = `073d7f9`. 20 remote branches remain (private/state + claude/api-auth-divergence-resolved + 3 dependabot + 15 to triage in R3).

**Auth:** new fine-grained `GITHUB_TOKEN` in `/home/hermes/.hermes/.env`, scoped to `consciousclarity/gustale.com` only. Use approved for this repo. Will NOT be used for any other repo, value never echoed.

## Terracotta — `feat/terracotta-design-pass` @ `8ebeb73`

**Not on VPS; may exist on GEEKOM (D:\gustale) or Mac; owner to check.**
Both `/home/deploy/gustale-checkout` and `/home/hermes/projects/gustale.com` are fresh clones of `main` — `8ebeb73` is unknown to both object stores. The branch (with its 63 WIP files + 3 refactors) was never pushed to origin and no longer exists on this VPS as a reachable git object. PROJECT.md's "old checkout" line is wrong — should say "stale (was terracotta WIP branch, no longer on this VPS)".

### Decisions taken (2026-10-16)
- **Aesthetic is already on main** (5+ PRs: `df0ef02` merge, `f51f0e9` apply, `af04580` AuthMenu, `439f502` dish detail, `5c726cd` admin).
- **The 3 refactors are already on main** via other branches (schema DRY `aa4cf45`, route unify `b044219`, web tsconfig `ce7f913`).
- **Recommendation: do not pursue** the local WIP. Even if `8ebeb73` is recovered from the GEEKOM/Mac, the diff would be a subset of what's already merged through cleaner paths.

## Tasks

### 1. Backup test-restore — ✅ DONE 2026-10-16
Pulled `gustale_backup_20261016T010943Z.dump.gpg` from offsite, decrypted with `.backup-key`, sha256 verified against remote claim (`3470161907cbf81b85e61bc846996b7820cf7c3fe35df8921de064c7936788b1`), restored into a throwaway `postgis/postgis:16-3.4` container (`docker run --rm`), 45 tables (incl. PostGIS), 121 published dishes — exact match with live API. Staging dir + container torn down. **Offsite backup is proven restorable.** Method in `.hermes/REPORTS/2026-10-16-branch-triage.md` §method.

### 2. Branch triage — R1+R2+R3 done
- **R1+R2 (30 branches):** deleted via API.
- **R3 (8 branches deleted, 14 archive tags):** 7 merged (`merged_at=true`) branches deleted after archive tag; 1 (`feat/variants-as-dishes`) was already gone (auto-cleaned by GitHub when its PR merged). 4 closed-no-merge and 4 no-PR branches got archive tags; kept in place for your review (per the rule "unmerged work needs archive tag first" — doesn't auto-authorize delete).
- **19 total archive tags** on origin: `archive/cursor-dev-environment-setup-e34b`, `archive/feat-content-pass-2026-07-24`, `archive/feat-nav-editorial`, `archive/fix-homepage-island-hydration`, `archive/spike-directus-evaluation`, `archive/feat-db-invariants`, `archive/feat-p1-1-dish-journey`, `archive/feat-u0-navigation-search`, `archive/feat-u0-trust-domain-routing`, `archive/feat-u0c-browse-usability`, `archive/feat-variants-as-dishes`, `archive/feat-windows-local-dev-wip`, `archive/refactor/seed-data-split`, `archive/feat-site-sophistication-pass`, `archive/feat-taxonomy-foundation`, `archive/feat-lineages-data-fix`, `archive/cursor-gallery-and-nav-editorial-6cb3`, `archive/feat-homepage-globe-v1`, `archive/fix-dishes-search-pagination`. Verified via `git ls-remote origin 'refs/tags/archive/*'`.
- **14 remaining remote branches:** claude/api-auth-divergence-resolved (KEEP, investigation), 3 dependabot (#58–60 open), 4 closed-no-merge (your call: revive or accept loss), 4 no-PR (KEEP per archive rule, or your call to delete after archive), 1 `ci/paths-ignore-docs` (PR-#62 stale branch, GitHub should auto-clean; if not, will be in next housekeeping), 1 `feat/content-copy-2026-07-24` (your open PR #57), 1 `fix/p0-4-email-verification` (1-ahead, 1 file — needs archive tag if you want to delete).
- **Delete rule (now in `.hermes/OPERATIONS.md`):** only delete branches that are ancestors of `origin/main` OR have a PR with `merged_at` set. Anything else = unmerged work → push `archive/<name>` tag first, verify, then delete (with your approval for non-merged).
- **Full report:** `.hermes/REPORTS/2026-10-16-round3-triage.md` and `.hermes/REPORTS/2026-10-16-branch-triage.md`.

### 3. Mock-data SSG build — 🟡 NEXT
Per your 2026-10-16 adjustment: NOT option (a) (no IP allowlist for GitHub runners). **Evaluate (1) build SSG on VPS at deploy time against local API vs (2) CI pulls a token-protected read-only data snapshot.** Will produce a recommendation with trade-offs after R3.

### 4. Content audit — 🟡 PENDING
Count dishes/regions/families, find thin pages, propose a content + image plan. Read-only against the API.
