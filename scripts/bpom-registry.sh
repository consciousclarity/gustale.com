#!/usr/bin/env bash
# Query BPOM with a private CSRF session. Refuse HTTP or invalid JSON responses.
set -euo pipefail
QUERY="${1:-}"
LENGTH="${2:-25}"
if [[ -z "${QUERY//[[:space:]]/}" || ! "$LENGTH" =~ ^[1-9][0-9]*$ || ${#LENGTH} -gt 4 ]]; then
  echo "REFUSED: usage: bpom-registry.sh '<nonempty query>' [positive length, at most 9999]" >&2
  exit 2
fi
SESSION=$(mktemp -d)
trap 'rm -rf "$SESSION"' EXIT
fetch() {
  local stage="$1" output="$2"
  shift 2
  local status
  if ! status=$(curl -sS -L --max-time 60 -o "$output" -w '%{http_code}' "$@"); then
    echo "REFUSED: BPOM $stage transport failure (curl diagnostic above)" >&2
    exit 2
  fi
  if [[ "$status" != 200 ]]; then
    echo "REFUSED: BPOM $stage HTTP $status (419 means expired CSRF/session; 403 may mean access denied)" >&2
    exit 2
  fi
}
fetch 'search page' "$SESSION/page" -c "$SESSION/cookies" \
  -G 'https://cekbpom.pom.go.id/all-produk' --data-urlencode "query=$QUERY"
TOKEN=$(python3 - "$SESSION/page" <<'PY'
from html.parser import HTMLParser
import sys
class Tokens(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tokens = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'meta' and a.get('name') == 'csrf-token':
            self.tokens.append(a.get('content', ''))
p = Tokens()
p.feed(open(sys.argv[1], encoding='utf-8').read())
if len(p.tokens) != 1 or not p.tokens[0] or any(c.isspace() or ord(c) < 32 for c in p.tokens[0]):
    print('REFUSED: BPOM search HTML has no unique usable CSRF token (login/challenge or markup change)', file=sys.stderr)
    sys.exit(2)
print(p.tokens[0])
PY
)
fetch 'product query' "$SESSION/result" -b "$SESSION/cookies" -c "$SESSION/cookies" \
  'https://cekbpom.pom.go.id/produk-dt/all' \
  -H 'X-Requested-With: XMLHttpRequest' -H "X-CSRF-TOKEN: $TOKEN" \
  -H 'Accept: application/json' \
  --data-urlencode 'draw=1' --data-urlencode 'start=0' \
  --data-urlencode "length=$LENGTH" --data-urlencode "search[value]=$QUERY" \
  --data-urlencode 'columns[0][data]=tipe'
python3 - "$SESSION/result" <<'PY'
import json, sys
def unique_object(pairs):
    data = {}
    for key, value in pairs:
        if key in data:
            raise ValueError(f'duplicate JSON field: {key}')
        data[key] = value
    return data
try:
    with open(sys.argv[1], encoding='utf-8') as f:
        data = json.load(f, object_pairs_hook=unique_object)
    if not isinstance(data, dict) or not isinstance(data.get('data'), list) or data.get('error'):
        raise ValueError('expected DataTables data array without an error')
    if any(not isinstance(row, dict) for row in data['data']):
        raise ValueError('registry data contains a non-object row')
    for field in ('recordsTotal', 'recordsFiltered'):
        if type(data.get(field)) is not int or data[field] < 0:
            raise ValueError(f'invalid {field}')
    if data['recordsFiltered'] > data['recordsTotal'] or len(data['data']) > data['recordsFiltered']:
        raise ValueError('inconsistent result counts')
except (ValueError, UnicodeError, OSError) as exc:
    print(f'REFUSED: BPOM product query returned invalid registry JSON: {exc}', file=sys.stderr)
    sys.exit(2)
print(json.dumps(data, ensure_ascii=False))
PY
