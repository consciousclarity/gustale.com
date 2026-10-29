# Gustale — Hermes operating rules (project-level)

## Branch deletion rule (learned 2026-10-16)
Before `git push origin --delete <branch>` (or API equivalent), the branch MUST be one of:
1. **Ancestor of `origin/main`** — verified by `git merge-base --is-ancestor <tip> origin/main`. Tip exists in main's history; safe to delete.
2. **Has a closed PR with `merged_at` set** — verified by GitHub REST `GET /repos/.../pulls/<N>` (or the closed-PRs listing) where the head ref matches and `merged_at` is non-null. Squash-merge case: tip is not an ancestor of main but the content is in the squash. Safe to delete.

Anything else counts as **unmerged work** and must be preserved:
- Push a tag `archive/<original-branch-name>` (lightweight, pointing at the original tip SHA) to origin.
- Verify the tag is on GitHub (`git ls-remote origin 'refs/tags/archive/<name>'`).
- THEN delete the branch.

A spike/WIP branch with no PR also gets an archive tag — the tip is still useful as a reference even if the work isn't going anywhere.

Never run `git gc --prune=now` or aggressive repack until all tips you'd want to recover have been verified-present on a remote (or in a backup). The local object store on the VPS has been wiped to fresh-clone state — anything you want preserved must be in a ref on origin.

## Deploy verification (learned 2026-10-16)
After CI completes on a PR, ALWAYS:
1. Read the actual `conclusion` of the `Deploy to Hostinger` check-run (not assume from earlier reads).
2. Re-check live state: `docker inspect <container> --format '{{.Config.Image}}'` for all gustale containers.
3. Re-check `curl /health` timestamp (new timestamp = new container).
4. Only then report deploy state.

If read #1 was ambiguous (e.g. read before job finished), say "unknown, checking" and re-read after waiting. Do NOT invent a cause.

## Paths-ignore for CI (applied 2026-10-16)
`.github/workflows/ci.yml` includes `paths-ignore: [.hermes/**, '**/*.md']` so docs-only merges skip Docker build + deploy.

## Content (T4, 2026-10-16)
- **Long descriptions**: 200–400 words, own words, never copy Wikipedia.
- **Every date, person, number, and origin claim must be backed by a cited source.** If a fact can't be cited, leave it out. Cite as `[Title — URL, accessed YYYY-MM-DD]`.
- **Fact-check** every description against the cited source before publishing via the API.
- **Covers:** Wikimedia Commons first, license + author stored as a source. AI images only where nothing exists, labelled as illustrations.

## Singleton-category merge (T4)
- Drop all country-cuisine singletons (e.g. `Austrian cuisine`, `Brazilian cuisine`) — the dish already has 1-3 better non-cuisine tags.
- Specifically approved: Wiener Schnitzel add `Breaded cutlet`. Poutine add `Street snack`. Bacalhau à Brás replace `Stir-fry` with `Egg dish`.
- Next: propose removing ALL `X cuisine` categories (geography belongs in `/regions`), but first verify every dish has its region set.
- After user OK on a batch, publish via API without asking again.

## Git / workflow
- Docs-only commits may go straight to main.
- Anything with code goes through a PR.

## Reporting
- Once a day in Telegram: what shipped, what's live, what's blocked.

## SSG (T3)
- Build on the VPS against `127.0.0.1:4000` (option 1) — firewall blocks CI→API.
- Do NOT use the token-protected-snapshot option (option 2) unless I can show it works without opening the firewall.

## Auth (learned 2026-10-16)
- **NEVER print, log, or send tokens, cookies, or passwords — not even partially** (learned 2026-10-16 — I leaked a partial session token in chat; user revoked all 72 sessions). The signed-in user can sign out remotely. If I need to verify auth worked, I print the email/role only, not the token.
- Sign in once per job, reuse the session. Re-signin on 401 (token expired) only.
- Credentials live in `~/.hermes/.hermes/.env` (mode 600) as `GUSTALE_API_BASE` / `GUSTALE_API_EMAIL` / `GUSTALE_API_PASSWORD`. Password is never echoed in chat or logs.
- Sign in: `POST /api/auth/sign-in/email` with body `{"email", "password"}` and header `Origin: https://gustale.com`. The user account is `hermes-bot@gustale.com` (role: moderator).
- **API calls MUST go through the public HTTPS endpoint** (`https://api.gustale.recipes`), not the local `http://127.0.0.1:4000`. The session cookies are `Secure`-flagged and the `requests` library (rightly) will not send them over HTTP. The env value `GUSTALE_API_BASE = http://127.0.0.1:4000` is documentation only; the client hardcodes the HTTPS base.
- After signin, reuse the `requests.Session` — it carries the cookies across calls. Don't re-signin per request.
- The bearer token returned in the signin body is **not** accepted by the PATCH endpoint (verified 401 on `PATCH /api/dishes/moussaka-greek` with `Authorization: Bearer ...`). The cookie is the only auth path that works.
- The Hermes client lives at **`scripts/hermes/gustale_client.py`** in the repo (not in `/tmp` — `/tmp` is volatile, surviving reboots and `rm -rf /tmp`). It contains NO secrets — credentials are read from `~/.hermes/.hermes/.env` at runtime.

## Memory hygiene (learned 2026-10-16)
- **NEVER delete or trim another project's memory entries.** I removed a bali.business entry; user caught it. Restoring it at start of next turn.
- **Gustale notes go in the repo's `.hermes/` files** (this file, plus PROGRESS.md, REPORTS/, SAMPLES/), **NOT in global memory** — global memory is shared across all sessions/projects and consolidation there is risky.
