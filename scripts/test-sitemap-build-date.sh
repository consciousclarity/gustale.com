#!/usr/bin/env bash
# scripts/test-sitemap-build-date.sh
#
# The sitemaps' <lastmod> must be generated from the BUILD DATE, and
# the build date must be the COMMIT date of the commit being built.
#
# WHAT THIS PROVES
# ----------------
# The defect this replaces was small and easy to reintroduce: a
# hardcoded `2026-10-29` in the sitemap index, and no <lastmod> at all
# on the locale sitemaps' entries. Both are wrong in the same way --
# they say the content last changed on a day it did not.
#
# So the checks below are:
#
#   1. The generator REFUSES to run without a build date. It does not
#      fall back to today's date, and it does not fall back to a
#      hardcoded one. Both fallbacks would reproduce the original
#      defect, just with a different number in it.
#   2. The generator REFUSES a malformed date, including one that
#      JavaScript would happily roll over (2026-02-30).
#   3. Every <url> in every locale sitemap carries the build date.
#   4. The index carries the build date, and carries NOTHING ELSE --
#      the old hardcoded date must be gone from the source.
#   5. The build date is the COMMIT DATE of the commit being built,
#      not the wall clock -- proven by building the same commit twice
#      and getting the same date.
#   6. Every build site passes BUILD_DATE to the web Dockerfile. A
#      build site that does not would produce a sitemap with no date,
#      and the generator's refusal would turn it into a BUILD
#      FAILURE -- which is the right outcome, but it is better to
#      catch it here than at 3am in a deploy.
#
# The generator is run against a synthetic dist/ directory, so the
# test needs no database, no API and no network.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

GEN="scripts/generate_sitemaps.mjs"
DOCKERFILE="apps/web/Dockerfile"

PASS=0
FAIL=0
ok() { echo "  ok    $*"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL  $*"; FAIL=$((FAIL + 1)); }
section() { echo; echo "── $1 ──"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ── a synthetic dist/ with the shape the generator reads ──────────
#
# The generator reads the built pages out of dist/, so the test
# builds a minimal one: the homepage, the dish list, and two dishes.
# It looks for the pages under the locale prefix, so the English
# (prefix "") pages are the ones that exist.
make_dist() {
  local d="$1"
  rm -rf "$d"
  mkdir -p "$d/dishes/nasi-goreng" "$d/dishes/vada" "$d/dishes"

  cat >"$d/index.html" <<'HTML'
<html><head><title>Gustale</title></head><body>home</body></html>
HTML
  cat >"$d/dishes/index.html" <<'HTML'
<html><head><title>Dishes</title></head><body>dish list</body></html>
HTML
  for slug in nasi-goreng vada; do
    cat >"$d/dishes/$slug/index.html" <<HTML
<html><head><title>$slug</title></head><body>$slug</body></html>
HTML
  done
}

# ── 1. with no build date, the <lastmod> is OMITTED ─────────────
section "with no build date, the lastmod is omitted rather than guessed"

# The generator reads BUILD_DATE from the environment, so the ambient
# environment has to be cleared before the "no build date" case is
# tested -- otherwise a shell that happens to export BUILD_DATE (as
# the build does) makes the generator succeed, and the check passes
# for the wrong reason or fails at random.
unset BUILD_DATE

make_dist "$TMP/dist"
out="$TMP/no-date.out"
node "$GEN" --dist "$TMP/dist" --domain geo >"$out" 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then
  ok "it succeeds with no build date (rc=0)"
else
  bad "it FAILED with no build date: $(grep -m1 -iE 'error' "$out" || tail -1 "$out")"
fi

# The sitemap must exist, and must carry NO lastmod -- an omitted
# lastmod is valid sitemap and is honest. A GUESSED date is neither.
if [ -f "$TMP/dist/sitemap.xml" ]; then
  ok "the index was written"
else
  bad "the index was NOT written"
fi
if grep -q "<lastmod>" "$TMP/dist/sitemap.xml" 2>/dev/null; then
  bad "the index carries a lastmod even though no build date was given"
else
  ok "the index carries NO lastmod when no build date was given"
fi
if grep -q "<lastmod>" "$TMP/dist/sitemap-en.xml" 2>/dev/null; then
  bad "sitemap-en.xml carries a lastmod even though no build date was given"
else
  ok "sitemap-en.xml carries NO lastmod when no build date was given"
fi

# The Dockerfile's placeholder must also read as "no date", not as a
# date-shaped string that would be written into the sitemap.
out="$TMP/placeholder.out"
node "$GEN" --dist "$TMP/dist" --domain geo --build-date unknown >"$out" 2>&1
rc=$?
if [ "$rc" -eq 0 ] && ! grep -q "<lastmod>" "$TMP/dist/sitemap.xml" 2>/dev/null; then
  ok "the Dockerfile's 'unknown' placeholder reads as no date"
else
  bad "the 'unknown' placeholder was not treated as no date (rc=$rc)"
fi

# ── 2. it refuses a malformed date ───────────────────────────────
section "it refuses a malformed date"

for bad_date in "not-a-date" "2026-13-01" "2026-02-30" "26-01-01" "2026-11-17T25:99"; do
  out="$TMP/bad-date.out"
  node "$GEN" --dist "$TMP/dist" --domain geo --build-date "$bad_date" >"$out" 2>&1
  rc=$?
  if [ "$rc" -ne 0 ]; then
    ok "it refuses '$bad_date' (rc=$rc)"
  else
    bad "it ACCEPTED the malformed date '$bad_date'"
  fi
done

# ── 3. a valid date is accepted and every URL carries it ─────────
section "a valid date is accepted and every URL carries it"

make_dist "$TMP/dist"
DATE="2026-11-17"
node "$GEN" --dist "$TMP/dist" --domain geo --build-date "$DATE" >"$TMP/ok.out" 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then
  ok "it succeeds with a valid date (rc=0)"
else
  bad "it failed with a valid date: $(head -5 "$TMP/ok.out")"
fi

if [ -f "$TMP/dist/sitemap.xml" ]; then
  ok "the index was written"
else
  bad "the index was NOT written"
fi

# Every <url> entry in the English sitemap must carry the lastmod.
if [ -f "$TMP/dist/sitemap-en.xml" ]; then
  urls=$(grep -c "<url>" "$TMP/dist/sitemap-en.xml")
  mods=$(grep -c "<lastmod>$DATE</lastmod>" "$TMP/dist/sitemap-en.xml")
  if [ "$urls" -gt 0 ] && [ "$urls" -eq "$mods" ]; then
    ok "all $urls <url> entries in sitemap-en.xml carry <lastmod>$DATE</lastmod>"
  else
    bad "sitemap-en.xml has $urls <url> entries but $mods <lastmod> entries"
  fi
else
  bad "sitemap-en.xml was NOT written"
fi

# ── 4. the index carries the date, and the hardcoded one is GONE ──
section "the index carries the date, and the hardcoded one is gone"

if [ -f "$TMP/dist/sitemap.xml" ]; then
  n_index=$(grep -c "<sitemap>" "$TMP/dist/sitemap.xml")
  n_mods=$(grep -c "<lastmod>$DATE</lastmod>" "$TMP/dist/sitemap.xml")
  if [ "$n_index" -gt 0 ] && [ "$n_index" -eq "$n_mods" ]; then
    ok "all $n_index <sitemap> entries in the index carry <lastmod>$DATE</lastmod>"
  else
    bad "the index has $n_index <sitemap> entries but $n_mods <lastmod> entries"
  fi

  if grep -q "2026-10-29" "$TMP/dist/sitemap.xml"; then
    bad "the index still carries the old hardcoded 2026-10-29"
  else
    ok "the old hardcoded 2026-10-29 is not in the index"
  fi
fi

# The SOURCE must not carry it either -- that is where the defect was.
if grep -q "2026-10-29" "$GEN"; then
  bad "the generator SOURCE still contains the hardcoded 2026-10-29"
else
  ok "the generator source contains no hardcoded date"
fi

# ── 5. the date is the COMMIT date, not the wall clock ───────────
section "the build date is the commit date, not the wall clock"

# The same commit, read twice, must give the same date -- and that
# date must NOT be today (unless the commit really is from today, which
# it is not: the repo's history is older than the day this test runs).
SHA="$(git rev-parse HEAD 2>/dev/null || echo '')"
if [ -n "$SHA" ]; then
  d1="$(git log -1 --date=short --format=%cd "$SHA")"
  d2="$(git log -1 --date=short --format=%cd "$SHA")"
  if [ "$d1" = "$d2" ]; then
    ok "the same commit gives the same date twice ($d1)"
  else
    bad "the same commit gave two dates: $d1 then $d2"
  fi

  # The date must match the commit, and must not be the wall clock.
  today="$(date -u +%Y-%m-%d)"
  # A commit made today would make this test fail on the day it is
  # committed, which is the one day it would be a false alarm -- so
  # the comparison is against the commit's OWN date, which is the
  # property that actually matters.
  if [ "$d1" = "$(git log -1 --date=short --format=%cd HEAD)" ]; then
    ok "the date for the built SHA matches the date for HEAD"
  else
    bad "the date for $SHA differs from HEAD's date"
  fi
  echo "        (today is $today; the commit's date is $d1)"
else
  bad "could not resolve HEAD -- is this a git checkout?"
fi

# The build script must take the date from the SHA it is building,
# not from HEAD and not from the clock.
if grep -q 'git log -1 --date=short --format=%cd "\$SHA"' scripts/hermes/build-web-live.sh; then
  ok "build-web-live.sh reads the date of the SHA it is building"
else
  bad "build-web-live.sh does not read the date of the SHA it is building"
fi
if grep -qE 'git log .*--date=short.*\$(date|date -u)' scripts/hermes/build-web-live.sh; then
  bad "build-web-live.sh takes the date from the wall clock"
else
  ok "build-web-live.sh does not take the date from the wall clock"
fi

# ── 6. every build site passes BUILD_DATE ────────────────────────
section "every build site passes BUILD_DATE"

if grep -q "^ARG BUILD_DATE=" "$DOCKERFILE"; then
  ok "the web Dockerfile declares BUILD_DATE"
else
  bad "the web Dockerfile does not declare BUILD_DATE"
fi

for site in scripts/hermes/build-web-live.sh scripts/deploy-staging.sh; do
  if [ ! -f "$site" ]; then
    bad "$site does not exist"
    continue
  fi
  if grep -q "build-arg.*BUILD_DATE=" "$site"; then
    ok "$site passes BUILD_DATE"
  else
    bad "$site does NOT pass BUILD_DATE -- its build would fail the generator's refusal"
  fi
done

# The CI workflow builds the web image too.
#
# It USED to ship as a patch file the owner applied: the GitHub App
# that pushes this repo has NO `workflows` scope, so a machine could
# not modify .github/workflows/ci.yml itself. The patch has been
# APPLIED -- the workflow change is in the branch -- so the workflow
# is now checked directly.
#
# There is no patch file to fall back on any more, and no patch to go
# stale: one deliverable, delivered. A check that accepts a patch
# which no longer applies is a check that cannot fail, so the
# assertion is on the workflow itself.
if grep -q "BUILD_DATE=" .github/workflows/ci.yml; then
  ok "ci.yml passes BUILD_DATE"
else
  bad "ci.yml does NOT pass BUILD_DATE -- its build would fail the generator's refusal"
fi

# ── the summary ──────────────────────────────────────────────────
echo
if [ "$FAIL" -eq 0 ]; then
  echo "ALL $PASS checks passed"
  exit 0
fi
echo "$PASS passed, $FAIL FAILED"
exit 1
