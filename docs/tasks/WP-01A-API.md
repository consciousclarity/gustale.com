# Task brief — WP-01a · the API's cover URLs (Codex)

## Context

Repo: `/home/alex/projects/gustale.com` (a geo-located dish and drink
encyclopedia). Branch: **`feature/wp-01-api-coverage`**, already pushed
to the remote and checked out from `origin/main` (`323eade`).

This is one half of WP-01 ("Browsing works"). The other half is the UI,
done separately by Claude Code. **Your work is the API half only.**

Read these first, in this order:
- `docs/improvement-pack/tasks/WP-01-browsing-works.md` — the brief
- `docs/WP-01-WP-02-DISCOVERY.md` — WP-00's measured findings (trust
  these; they were measured against live)
- `docs/WP-00-REPORT.md` — how the site actually works

## The defect (already diagnosed — verify it, then fix it)

`GET /api/dishes/featured` returns each dish's `cover.variantsUrls`
**without** the `/media/` prefix, so all 12 featured covers 404 on the
home page. `publicUrl` is **correct** on both endpoints — do not "fix" it.

**The cause, precisely:**

`apps/api/src/routes/dishes.ts:1222-1223` (the featured route):
```ts
publicUrl: `/media/${row.cover_storage_key}`,
variantsUrls: (row.cover_variants as Record<string, string>) ?? {},
```

The raw `cover_variants` map is passed straight through. The map's values
are bare storage keys (`dishes/<slug>/cover-800w.webp`).

`apps/api/src/routes/dishes.ts:428` (the list route) does it correctly:
```ts
const variantsUrls = mapVariantsToUrls(row.cover_variants);
```

`mapVariantsToUrls` (`apps/api/src/routes/dishes.ts:1510`) is the helper
that maps `{"800": "<key>"}` → `{"800": "/media/<key>"}`. It already
exists, it is already correct, and it is already guarded against drift
between two copies by `media-public.test.ts`.

**So the fix is to use the existing helper in the featured route.**

## What to do

1. **Verify the diagnosis first.** Confirm by reading the code and by
   hitting the live API:
   ```bash
   curl -s 'https://api.gustale.recipes/api/dishes/featured' | head -c 600
   ```
   Confirm `variantsUrls["800"]` has no `/media/` prefix and that
   `publicUrl` does. **If the diagnosis is wrong, stop and report — do
   not guess.**

2. **Fix it.** Use `mapVariantsToUrls(row.cover_variants)` in the
   featured route.

   Check the two call sites pass the **same shape**: the list route
   passes `row.cover_variants` (a JSONB map of width → storage key) and
   the featured route has the same `row.cover_variants`. Confirm that by
   reading the SQL of both queries, because a shape mismatch would make
   the helper produce `/media//media/...` or an empty map.

3. **Audit every other endpoint that returns a cover**, for the same
   defect. Search for `variantsUrls` across `apps/api/src/`. Each one
   must go through `mapVariantsToUrls`. Report every site you find and
   what you did about it. **Do not change an endpoint that is already
   correct.**

4. **Add tests.** A unit test that asserts:
   - every variant URL in `/api/dishes/featured` starts with `/media/`
   - the featured route and the list route produce the **same** URL for
     the same media row (this is the drift guard)
   - a media row with no variants produces `{}`, not `{ "800": undefined }`
   Put it in `apps/api/test/` — there is already `dishes-featured.test.ts`
   and `media.test.ts`; follow their style.

5. **Run the checks.** From the repo root:
   ```bash
   pnpm --filter @gustale/api run typecheck
   pnpm --filter @gustale/api run test
   node scripts/run-lint.mjs
   ```

6. **Commit** on the branch `feature/wp-01-api-coverage` with a clear
   message. Push it:
   ```bash
   python3 scripts/hermes/push_sha_as_app.py origin feature/wp-01-api-coverage <your-verified-sha> <the-current-remote-sha>
   ```
   Get the current remote sha with `git ls-remote origin refs/heads/feature/wp-01-api-coverage`.
   **Never force-push.** The helper refuses a non-fast-forward. If it says
   "remote moved", fetch, reconcile, and re-run — never overwrite.

## Rules — these are absolute

- **Do not touch the web app.** The UI is Claude Code's branch. Touching
  `apps/web/` in this branch will make the two branches conflict.
- **Do not change the API's `limit` ceiling** (`dishes.ts:53`,
  `max(100)`). It is deliberate. WP-02's owner instruction says not to
  raise it.
- **Do not touch the database.** No migrations, no writes to live. This
  package adds no schema.
- **Do not change the associations endpoint.** WP-00 proved it works.
- **Do not deploy.** Merge and deploy need the owner's explicit approval.
- **Do not open a PR.** Leave the branch ready; the owner decides.
- **Never print a secret.** No API keys, no tokens, no passwords.

## What to save

Write your findings and the diff summary to
`/home/alex/projects/gustale.com/docs/WP-01A-API-REPORT.md` before you
finish, so the work survives an iteration limit. It must contain:
- your verification of the diagnosis (the live response, trimmed)
- every `variantsUrls` site you audited, and what you changed
- the test names you added and the test output
- the commit sha you pushed
- anything you found that you did **not** fix, and why

## Completion criteria

- The featured route's variant URLs all start with `/media/`.
- The API's own tests pass, typecheck passes, lint passes.
- The report file exists with the content above.
- The branch is pushed, as a fast-forward.

## Budget

Stop and report if you find the diagnosis to be wrong, if the fix would
require changing the API's public contract beyond the cover URLs, or if
you need a migration. Do not widen the scope.
