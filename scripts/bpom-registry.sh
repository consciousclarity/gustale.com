#!/usr/bin/env bash
#
# GUSTALE: the Indonesian food regulator's own product registry.
# bpom.sh -- query the BPOM (Badan Pengawas Obat dan Makanan) product
# registry, the Indonesian food regulator's own database of registered
# food products.
#
# Usage: bpom.sh "<query>" [length]
#
# WHAT THIS IS FOR
# ----------------
# "Is this product made in Indonesia or imported?" is not answered by a
# marketplace listing. It is answered by the BPOM registration:
#
#   - a product with an IMPORTER recorded, and a "ML" number (Makers
#     List), is IMPORTED -- the ML is the foreign maker's registration;
#   - a product with only an MD number (Makers/Distributor List,
#     Indonesian makers) and NO importer is made LOCALLY.
#
# The JSON carries PRODUCT_REGISTER (the MD/ML number),
# PRODUCT_BRANDS, and IMPORTER_ID, which is exactly the distinction.
#
# It gets a CSRF token and a session cookie first, because the
# DataTables endpoint is a POST behind Laravel's CSRF middleware.
set -uo pipefail

QUERY="${1:?usage: bpom.sh '<query>' [length]}"
LENGTH="${2:-25}"
JAR="$(mktemp)"
trap 'rm -f "$JAR" /tmp/bpom.cookies' EXIT

# The query MUST be URL-encoded here, exactly as it is in the POST
# below. Without the encoding a term with a space ("asam jawa") makes
# the request malformed, and the symptom is a REFUSED message that
# looks like the registry being unreachable rather than a bad URL.
TOKEN=$(curl -sL -m 45 -c /tmp/bpom.cookies \
  -G "https://cekbpom.pom.go.id/all-produk" \
  --data-urlencode "query=${QUERY}" \
  | grep -o 'csrf-token" content="[^"]*' | head -1 | cut -d'"' -f3)

if [ -z "$TOKEN" ]; then
  echo "REFUSED: could not read the CSRF token from cekbpom.pom.go.id" >&2
  echo "  the query was: ${QUERY}" >&2
  echo "  the registry is behind a CSRF middleware, and the token comes" >&2
  echo "  from the search page. If the query contains a space or a" >&2
  echo "  slash it must be URL-encoded, which this script now does." >&2
  exit 2
fi

curl -sL -m 60 -b /tmp/bpom.cookies -c /tmp/bpom.cookies \
  -X POST 'https://cekbpom.pom.go.id/produk-dt/all' \
  -H 'X-Requested-With: XMLHttpRequest' \
  -H "X-CSRF-TOKEN: $TOKEN" \
  --data-urlencode 'draw=1' \
  --data-urlencode 'start=0' \
  --data-urlencode "length=${LENGTH}" \
  --data-urlencode "search[value]=${QUERY}" \
  --data-urlencode 'columns[0][data]=tipe' \
  -H 'Accept: application/json'
