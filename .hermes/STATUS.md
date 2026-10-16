# Gustale — status at handover (2026-10-16)
- Live and healthy: gustale.com 200, gustale.recipes 200, api /health 200.
- Running image 9772542 == origin/main HEAD (PR #56) — verified 2026-10-16. Clean baseline.
- Branch feat/terracotta-design-pass (8ebeb73, 2026-06-20) is NOT merged/deployed: WIP terracotta design pass + 3 behaviour-preserving refactors. Decide: finish & merge, or archive.
- Known issue: Astro SSG pages were built with mock API data because CI runners could not reach the live API through the VPS firewall.
- 47 unmerged remote branches (claude/, codex/, cursor/, data/, feat/…) — triage: merge, archive or leave.
- Backups OK: gustale-backup.timer runs daily 09:09 WITA — encrypted offsite DB+media backup, GFS retention (11 DB snapshots), last SUCCESS 2026-10-16. Local dumps in backups/ are only old pre-migration snapshots.
- Full VPS backup + Hostinger snapshot taken 2026-10-16.

## First tasks for Hermes
1. Do a test restore of the latest offsite backup into a scratch database (prove backups are usable).
2. Compare main vs running SHA; read HANDOFF.md and refactor-gustale.md on the terracotta branch; propose merge-or-archive.
3. Fix the mock-data SSG build (build against live API data).
4. Content audit: count dishes/regions/families, find empty or thin pages, propose a content + image plan.
