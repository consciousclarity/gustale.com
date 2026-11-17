#!/usr/bin/env bash
# THE LIVE CURL TABLE for the single-domain cutover.
#
# For every case: the status, the Location header, the number of hops
# to the final answer, and the final status.
#
# A case PASSES when the redirect is right: a 301, the exact Location
# the rule table says, and ONE hop. The final 200 is asserted
# separately, and only for the paths where a 200 is the honest
# expectation -- whether a page EXISTS is a content question, not a
# redirect question.
set -uo pipefail

pass=0
fail=0
TMP_OUT=$(mktemp)
trap 'rm -f "$TMP_OUT"' EXIT

# ─── the redirect only: the Location must be right ────────────────────────
#
# The FINAL status is reported but not asserted. `/es/ingredients/tomato`
# is a 404 on gustale.com ITSELF -- the locale prefix is not generated for
# ingredient pages -- and the redirect still did its job by sending the
# reader to the same path on the canonical host. A redirect that lands on
# a 404 is the right behaviour; inventing a 200 would be the bug.
#
case_one() {
  local label="$1" host="$2" path="$3" expect="$4"
  local first status location hops final

  # the first response: the 301 and where it points.
  # WITHOUT -L on purpose: following it would report the FINAL 200 and
  # hide the very thing this table is about.
  first=$(curl -sS -o /dev/null --max-time 25 \
    -w '%{http_code}|%{redirect_url}' "$host$path" 2>/dev/null)
  status=$(echo "$first" | cut -d'|' -f1)
  location=$(echo "$first" | cut -d'|' -f2)

  # the chain: how many hops, and what does it end on
  final=$(curl -sS -o /dev/null --max-time 25 -L \
    -w '%{http_code}|%{num_redirects}' "$host$path" 2>/dev/null)
  hops=$(echo "$final" | cut -d'|' -f2)
  final=$(echo "$final" | cut -d'|' -f1)

  printf '  %-52s %s' "$label" "$status"
  [ -n "$location" ] && printf '  %-58s' "$location"
  printf '  hops=%-2s final=%s\n' "$hops" "$final"

  local ok=1
  [ "$status" = "301" ] || ok=0
  [ "$location" = "$expect" ] || ok=0
  [ "$hops" = "1" ] || ok=0

  if [ "$ok" = "1" ]; then
    pass=$((pass + 1))
    printf '      PASS\n'
  else
    fail=$((fail + 1))
    printf '      FAIL  (expected status=301, hops=1, location=%s)\n' "$expect"
  fi
}

# ─── the redirect AND the target must both be a 200 ───────────────────────
#
# This is the "final 200" column: the paths a reader actually lands on.
case_one_final_200() {
  local label="$1" host="$2" path="$3" expect="$4"
  case_one "$label" "$host" "$path" "$expect" > "$TMP_OUT"
  cat "$TMP_OUT"
  if grep -q 'FAIL' "$TMP_OUT"; then
    return
  fi
  local final
  final=$(curl -sS -o /dev/null --max-time 25 -L -w '%{http_code}' "$host$path" 2>/dev/null)
  if [ "$final" = "200" ]; then
    pass=$((pass + 1))
    printf '      PASS  (the final page is a 200)\n'
  else
    fail=$((fail + 1))
    printf '      FAIL  (the final page is %s, expected 200)\n' "$final"
  fi
}

# ─── one case for a path that must NOT redirect (the proxy paths) ────────
case_proxy() {
  local label="$1" url="$2" expect_status="$3"
  local status
  status=$(curl -sS -o /dev/null --max-time 25 -w '%{http_code}' "$url" 2>/dev/null)
  printf '  %-52s %s' "$label" "$status"
  printf '  (proxied, no redirect)\n'
  if [ "$status" = "$expect_status" ]; then
    pass=$((pass + 1))
    printf '      PASS\n'
  else
    fail=$((fail + 1))
    printf '      FAIL  (expected %s)\n' "$expect_status"
  fi
}

echo "=== the live curl table ==="
echo

echo "── gustale.recipes (the old canonical recipes host) ──"
case_one_final_200 "gustale.recipes/            -> /recipes"        "https://gustale.recipes" "/" "https://gustale.com/recipes"
case_one_final_200 "gustale.recipes/recipes     -> /recipes"        "https://gustale.recipes" "/recipes" "https://gustale.com/recipes"
case_one_final_200 "gustale.recipes/recipes/    -> /recipes"        "https://gustale.recipes" "/recipes/" "https://gustale.com/recipes"
case_one_final_200 "gustale.recipes/dishes/bakso -> /dishes/bakso#recipes" "https://gustale.recipes" "/dishes/bakso" "https://gustale.com/dishes/bakso#recipes"
case_one_final_200 "gustale.recipes/ingredients/tomato -> same path" "https://gustale.recipes" "/ingredients/tomato" "https://gustale.com/ingredients/tomato"
case_one_final_200 "gustale.recipes/login       -> same path"       "https://gustale.recipes" "/login" "https://gustale.com/login"
case_one_final_200 "gustale.recipes/dishes/new  -> /dishes/new"     "https://gustale.recipes" "/dishes/new" "https://gustale.com/dishes/new"
echo
echo "  -- the QUERY case (the query must survive the redirect) --"
case_one_final_200 "gustale.recipes/recipes?q=tomato -> /recipes?q=tomato" "https://gustale.recipes" "/recipes?q=tomato" "https://gustale.com/recipes?q=tomato"
case_one "gustale.recipes/dishes/bakso?x=1 -> same path+query"  "https://gustale.recipes" "/dishes/bakso?x=1" "https://gustale.com/dishes/bakso?x=1#recipes"
echo
echo "  -- the LOCALE case (the locale prefix must survive) --"
case_one_final_200 "gustale.recipes/es/dishes/bakso -> /es/dishes/bakso" "https://gustale.recipes" "/es/dishes/bakso" "https://gustale.com/es/dishes/bakso"
case_one "gustale.recipes/es/ingredients/tomato -> same path" "https://gustale.recipes" "/es/ingredients/tomato" "https://gustale.com/es/ingredients/tomato"
echo
echo "  -- the API and MEDIA paths are PROXIED, not redirected --"
case_proxy "gustale.recipes/api/dishes"        "https://gustale.recipes/api/dishes" "200"
case_proxy "gustale.recipes/media/ (listing)"   "https://gustale.recipes/media/" "403"
echo

echo "── www.gustale.recipes ──"
case_one_final_200 "www.gustale.recipes/         -> /recipes" "https://www.gustale.recipes" "/" "https://gustale.com/recipes"
case_one_final_200 "www.gustale.recipes/dishes/bakso -> /dishes/bakso#recipes" "https://www.gustale.recipes" "/dishes/bakso" "https://gustale.com/dishes/bakso#recipes"
case_one_final_200 "www.gustale.recipes/es/dishes/bakso -> /es/dishes/bakso" "https://www.gustale.recipes" "/es/dishes/bakso" "https://gustale.com/es/dishes/bakso"
echo

echo "── recipes.gustale.com ──"
case_one_final_200 "recipes.gustale.com/         -> /recipes" "https://recipes.gustale.com" "/" "https://gustale.com/recipes"
case_one_final_200 "recipes.gustale.com/recipes  -> /recipes" "https://recipes.gustale.com" "/recipes" "https://gustale.com/recipes"
case_one_final_200 "recipes.gustale.com/recipes/ -> /recipes" "https://recipes.gustale.com" "/recipes/" "https://gustale.com/recipes"
case_one_final_200 "recipes.gustale.com/dishes/bakso -> /dishes/bakso#recipes" "https://recipes.gustale.com" "/dishes/bakso" "https://gustale.com/dishes/bakso#recipes"
case_one_final_200 "recipes.gustale.com/ingredients/tomato -> same path" "https://recipes.gustale.com" "/ingredients/tomato" "https://gustale.com/ingredients/tomato"
case_one_final_200 "recipes.gustale.com/login    -> same path" "https://recipes.gustale.com" "/login" "https://gustale.com/login"
case_one_final_200 "recipes.gustale.com/dishes/new -> /dishes/new" "https://recipes.gustale.com" "/dishes/new" "https://gustale.com/dishes/new"
echo
echo "  -- the QUERY case --"
case_one_final_200 "recipes.gustale.com/recipes?q=tomato -> /recipes?q=tomato" "https://recipes.gustale.com" "/recipes?q=tomato" "https://gustale.com/recipes?q=tomato"
case_one "recipes.gustale.com/dishes/bakso?x=1 -> same path+query"  "https://recipes.gustale.com" "/dishes/bakso?x=1" "https://gustale.com/dishes/bakso?x=1#recipes"
echo
echo "  -- the LOCALE case --"
case_one_final_200 "recipes.gustale.com/es/dishes/bakso -> /es/dishes/bakso" "https://recipes.gustale.com" "/es/dishes/bakso" "https://gustale.com/es/dishes/bakso"
case_one "recipes.gustale.com/es/ingredients/tomato -> same path" "https://recipes.gustale.com" "/es/ingredients/tomato" "https://gustale.com/es/ingredients/tomato"
echo
echo "  -- the API and MEDIA paths are PROXIED, not redirected --"
case_proxy "recipes.gustale.com/api/dishes"        "https://recipes.gustale.com/api/dishes" "200"
case_proxy "recipes.gustale.com/media/ (listing)"   "https://recipes.gustale.com/media/" "403"
echo

echo "── recipe.gustale.com (the singular typo) ──"
echo "  NOT SERVED BY THIS VPS: the A record still points at the registrar"
echo "  (15.197.162.184), so the public answer comes from there. Our file"
echo "  is in place and will take over when the A record is pointed here."
echo "  The registrar's 301 DROPS the path, which is the bug this file fixes."
echo "  Caddy holds NO certificate for this name -- it never could, because"
echo "  the A record is not here. The OLD config imported the same file, so"
echo "  this is pre-existing and dormant, NOT a regression."
echo
echo "  -- what the registrar answers (the path is DROPPED) --"
reg_status=$(curl -sS -o /dev/null --max-time 25 -w '%{http_code}' "https://recipe.gustale.com/dishes/bakso" 2>/dev/null)
reg_loc=$(curl -sS -o /dev/null --max-time 25 -w '%{redirect_url}' "https://recipe.gustale.com/dishes/bakso" 2>/dev/null)
printf '  %-52s %s  %s\n' "recipe.gustale.com/dishes/bakso" "$reg_status" "$reg_loc"
if [ "$reg_status" = "301" ] && [ "$reg_loc" = "https://recipes.gustale.com/" ]; then
  pass=$((pass + 1))
  printf '      PASS  (the registrar answers 301 and drops the path -- as documented)\n'
else
  fail=$((fail + 1))
  printf '      FAIL  (the registrar answered %s -> %s)\n' "$reg_status" "$reg_loc"
fi
echo
echo "  -- and OUR answer, from this server, with the hostname forced --"
echo "     (the TLS handshake fails: no certificate can be issued while"
echo "      the A record points elsewhere. This is the dormancy, not a fault.)"
ssh -o ConnectTimeout=15 -i ~/.ssh/gustale-cd/id_ed25519 root@62.72.7.218 \
  "curl -sS -k -o /dev/null --max-time 15 --resolve recipe.gustale.com:443:127.0.0.1 \
   -w '  HTTP %{http_code}  Location: %{redirect_url}\n' https://recipe.gustale.com/ 2>&1" 2>/dev/null || true
echo

echo "── gustale.com itself does NOT redirect (it is the target) ──"
for p in / /dishes /recipes /ingredients /map /admin; do
  code=$(curl -sS -o /dev/null --max-time 25 -w '%{http_code}' "https://gustale.com$p" 2>/dev/null)
  printf '  %-52s %s\n' "gustale.com$p" "$code"
  if [ "$code" = "200" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf '      FAIL  (expected 200)\n'
  fi
done
echo

echo "=== $pass passed, $fail failed ==="
[ "$fail" = "0" ]
