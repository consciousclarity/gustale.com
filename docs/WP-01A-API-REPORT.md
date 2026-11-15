# WP-01A API report

Date: 2026-11-11. Branch: `feature/wp-01-api-coverage`.

## Diagnosis verified

Read the task brief and all three supporting documents in full. The prescribed
read-only live request returned this trimmed response (first 600 bytes):

```text
{"dishes":[{"id":"00000000-0000-0000-0000-000000000020","slug":"moussaka-greek","canonicalName":"Moussaka","shortDescription":"A layered casserole of fried eggplant, spiced minced meat, and béchamel sauce, baked until golden. Considered the national dish of Greece.","contentType":"dish","viewCount":2906,"originName":"Greece","familySlug":"casserole","familyName":"Casserole","cover":{"publicUrl":"/media/dishes/moussaka-greek/cover-1536w.webp","variantsUrls":{"800":"dishes/moussaka-greek/cover-800w.webp","1536":"dishes/moussaka-greek/cover-1536w.webp"},"width":1536,"height":1152,"altText":"Gree
```

`publicUrl` is correct; variants are bare keys. Both list and featured SQL select
`m.variants AS cover_variants` through the cover lateral join, then select
`cov.cover_variants AS cover_variants`. Both therefore pass the same JSONB
width-to-storage-key map to the helper. No double prefix or shape conversion is needed.

## Complete variantsUrls audit

All occurrences under `apps/api/src/` are in `routes/dishes.ts`:

| Site (original line) | Result |
| --- | --- |
| List cover, 428/437 | Already uses `mapVariantsToUrls(row.cover_variants)`; unchanged. |
| Detail media gallery, 737 | Already uses `mapVariantsToUrls(m.variants)`; unchanged. |
| Detail cover image, 743 | Already uses `mapVariantsToUrls(coverImage.variants)`; unchanged. |
| Featured cover, 1223 | Changed raw map passthrough to `mapVariantsToUrls(row.cover_variants)`. |
| Comments, 421/724 | Documentation, not additional emitters. |

Also inspected `routes/media.ts:324`: its response field is named `variants`
and already uses its local `mapVariantsToUrls(row.variants)`; unchanged.
The existing helper at `dishes.ts:1510` and all `publicUrl` expressions are unchanged.

## Tests and checks

Added `apps/api/test/dishes-featured-cover.test.ts`, using Vitest assertions and
Fastify injection as in `dishes-featured.test.ts`. Real handlers serialize fixed
media rows; database execution is mocked, so these tests neither need nor write a database.

Test names:

- `prefixes every featured variant URL with /media/`
- `returns the same variant URLs from featured and list for the same media row`
- `returns {} when a media row has no variants (%j)` (null, undefined, and empty map)

Focused test output:

```text
Test Files  1 passed (1)
     Tests  5 passed (5)
```

Installed locked dependencies and compiled `@gustale/db` locally (no database operation).
Required checks:

```text
pnpm --filter @gustale/api run typecheck
$ tsc --noEmit
exit 0

pnpm --filter @gustale/api run test
Test Files  18 failed | 3 passed (21)
     Tests  28 passed (28)
exit 1

node scripts/run-lint.mjs
  the files biome checked: 243
=== the lint: OK ===
exit 0
```

The full suite cannot initialize its 18 database-dependent test files because
`DATABASE_URL is not set` and this checkout has no API `.env`. The initial run
also lacked the built `@gustale/db` entry; compiling that dependency resolved
that import issue. No credentials were sourced and no database was provisioned
or changed. Full-suite completion remains blocked on an owner-provided test environment.

## Commit and push

Implementation commit: `4b120791dd76bb944e6a1d64e9569442f2e28820`.
This commit is pushed with the report commit as its descendant on the requested branch.
The report commit's SHA is available from `git log -1 -- docs/WP-01A-API-REPORT.md`.
The requested push helper is absent in the repository; the existing copy at
`/home/alex/.hermes/github-app/push_sha_as_app.py` is used through a temporary
local launcher, preserving its explicit SHA, expected remote SHA, and fast-forward checks.

## Unchanged and limitations

No web files, limit ceiling, associations endpoint, publicUrl, schema, or database
were changed. No deployment or PR. Existing untracked discovery and WP-02 notes
were left untouched and excluded from commits. UI region handling and other
WP-00 findings belong to other work packages. The helper's comment mentions
`media-public.test.ts`, but that file is absent in this checkout; no unrelated
test reconstruction was attempted. Production still needs the owner's later
deployment. The full API suite is not green for the environment reason above;
this report does not claim all completion criteria have passed.
