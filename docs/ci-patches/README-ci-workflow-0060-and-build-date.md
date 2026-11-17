# Gustale CI workflow — two pending fixes in ONE patch

**The GitHub App that pushes this repository has NO `workflows` scope**, so no
machine can modify `.github/workflows/ci.yml`. This file is the patch that
does it. **A human with write access applies it.**

It carries BOTH pending workflow changes, so it is one action, not two:

1. **the sitemaps' `<lastmod>`** — the `build-web` job now reads the commit
   date and passes it to the web image as `BUILD_DATE`, and a new CI step
   runs `scripts/test-sitemap-build-date.sh`. Without this the CI-built web
   image bakes sitemaps with **no `<lastmod>` at all** (the generator refuses
   to guess one), which is what production served from 2026-11-17 until the
   timer's copy was refreshed on 2026-11-18.
2. **migration 0060** — the workflow's own migration list now includes
   `0060_legacy_associations_published.sql`. Without it the
   "Validate the CI migration chain" step fails closed, because 0060 is in
   the local chain scripts but not in the workflow.

## Apply it

```bash
cd /path/to/gustale.com
git fetch origin
git checkout -B fix/ci-workflow-0060-and-build-date origin/main
git apply docs/ci-patches/ci-workflow-0060-and-build-date.patch
git add .github/workflows/ci.yml
git commit -m "ci: the 0060 migration and the sitemap build date"
git push -u origin fix/ci-workflow-0060-and-build-date
```

Then open a PR for that branch and merge it.

**A workflow-only commit does not trigger CI** (GitHub's anti-loop
protection). Open the PR instead — the PR's own CI run is what you want to
see.

## Verify it applied

```bash
grep -n "0060_legacy_associations_published" .github/workflows/ci.yml
grep -n "BUILD_DATE=" .github/workflows/ci.yml
```

Both must print a line. Then the CI run must show:

- the **"Test the sitemap's build date"** step, green;
- the **"Validate the CI migration chain"** step, green;
- the `build-web` job's `build-args` carrying `BUILD_DATE=`.

## If the patch does not apply

`origin/main` has moved. Re-create it against the current `main`:

```bash
git fetch origin
git checkout -B fix/ci-workflow-0060-and-build-date origin/main
git apply docs/ci-patches/ci-sitemap-build-date.patch
git apply docs/ci-patches/ci-legacy-associations-0060.patch
```

The two parts touch different hunks (the sitemap patch at lines 412/1526/1542,
the 0060 patch at 1306), so they do not conflict with each other — only with
a moved `main`.
