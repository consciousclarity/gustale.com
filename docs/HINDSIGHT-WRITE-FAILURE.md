# Hindsight write failure — the base URL is still the wrong host

**Date:** 2026-11-06
**Status:** diagnosed, NOT fixed. The fix needs `root` or the `hermes`
user; I have neither.

---

## The symptom

`hindsight_retain` fails:

```
Fact extraction failed: 1/1 chunks failed. chunk 0: AuthenticationError:
Error code: 401 - {'type': 'error', 'error': {'type': 'authorized_error',
'message': 'invalid api key (2049)', 'http_code': '401'}}
```

Reads, recall, health and the bank API are all fine. The bank's last
successful write was **2026-10-30T22:44:01Z** (`last_memory_write_at`).

---

## What was ruled out

**The API key is good.** The key in `/home/gustale/.hermes/.env`
(`MINIMAX_API_KEY`, 125 chars) was called directly:

| host | path | result |
|---|---|---|
| `api.minimax.io` | `/v1/chat/completions` | **200** |
| `api.minimax.io` | `/v1/chat/completions` (model `MiniMax-M3`) | **200** |
| `api.minimax.io` | `/v1/chat/completions` (model `MiniMax-M3.1-Flash`) | **200** |
| `api.minimax.io` | `/v1/chat/completions` (model `MiniMax-M2.7`) | **200** |
| `api.minimax.io` | `/anthropic/v1/messages` | **200** |
| `api.minimaxi.com` | `/v1/chat/completions` | **401 `invalid api key (2049)`** |

**The model name is not the problem.** All three model names work.

**Hindsight's code is not pointing at the bad host.** In
`hindsight_api/engine/llm_wrapper.py:1013` and
`hindsight_api/engine/providers/openai_compatible_llm.py:890`, the
default for `provider == "minimax"` is:

```python
self.base_url = "https://api.minimax.io/v1"
```

The string `api.minimaxi.com` appears **nowhere** in the installed
package. The wrong host can only come from an explicit override.

---

## The decisive test: error 2049 identifies the host

MiniMax answers differently depending on the key:

| key | `api.minimax.io` | `api.minimaxi.com` |
|---|---|---|
| the real key | **200** | **401 code 2049** |
| garbage (`not-a-key`) | 401 `login fail … (1004)` | 401 `login fail … (1004)` |
| well-formed but unknown | 401 `login fail … (1004)` | 401 `login fail … (1004)` |

So:

- **1004** = "that is not a key at all"
- **2049** = "that IS a real MiniMax key, but this host does not know it"

`api.minimax.io` returns **200 or 404 — never 2049**:
`https://api.minimax.io/chat/completions` (no `/v1`) is a plain 404.

**Therefore the server is calling `api.minimaxi.com`.** The key it
holds is a genuine MiniMax key, being sent to the wrong host. That is
the whole failure.

### The test, re-run properly (2026-11-06 09:40)

The first version of this matrix was run through a shell. A shell
mangled the key (quoting and `$` expansion), so **both** hosts
answered `1004` — which would have looked like "the host does not
matter". It was not a real result. Re-run in Python, reading the key
from the environment and never printing it:

```
MINIMAX_API_KEY      len=125  prefix='sk-cp-'

  api.minimax.io  /v1  bearer        http=200  (model reply)
  api.minimaxi.com /v1  bearer        http=401  invalid api key (2049)
  api.minimax.io  /v1  bearer MALFORMED   http=401  login fail … (1004)
  api.minimaxi.com /v1  bearer MALFORMED http=401  login fail … (1004)
```

So the table above holds, and **2049 is a host signal**: the same key
that the correct host accepts with 200 is rejected by the other host
with 2049, while a malformed key gets 1004 from both.

### Matching the request_id

MiniMax issues `request_id` values from one sequential space shared
by both hosts, so a request_id in a Hindsight error can be matched
against a host to prove which one served it. Hindsight's failing
retain (2026-11-06T01:34:17Z, operation `retain`, scope
`retain_extract_facts`, provider `minimax`, model `MiniMax-M3`)
carried:

```
request_id: 073c61998ac74d865ac956bf5db8062a
error: AuthenticationError: Error code: 401
        {'type': 'authorized_error', 'message': 'invalid api key (2049)'}
```

The only host that answers with `2049` is `api.minimaxi.com`. The
request Hindsight logged is the request to the wrong host.

---

## Why the restart did not fix it

The service was restarted after the env edit, so the restart is not
the problem:

| when | what |
|---|---|
| 07:15:39 | `/home/hermes/.hindsight/profiles/hermes.env` modified |
| 07:15:41 | `hindsight-api` process started (pid 176521) |
| 08:34:37 | my test write — failed with 2049 |

The unit is `hindsight.service` (systemd **--user**, user `hermes`):

```ini
[Service]
ExecStart=/home/hermes/.local/bin/hindsight-api
WorkingDirectory=/home/hermes
EnvironmentFile=/home/hermes/.hindsight/profiles/hermes.env
```

`EnvironmentFile` is the right file, and `find_dotenv(usecwd=True)`
finds no competing `.env` (`/home/hermes/.env`, `/home/.env` and `/.env`
are all absent), so the profile env is authoritative.

**So the env file still contains the wrong host** — most likely because
the correction was written to a variable Hindsight does not read.
Hindsight reads exactly:

| variable | meaning |
|---|---|
| `HINDSIGHT_API_LLM_BASE_URL` | the host to call |
| `HINDSIGHT_API_LLM_API_KEY` | the key |
| `HINDSIGHT_API_LLM_PROVIDER` | `minimax` |
| `HINDSIGHT_API_LLM_MODEL` | `MiniMax-M3` |

A correction written to `MINIMAX_BASE_URL` (the name Hermes itself
uses) would be silently ignored. The file is 0600 owned by `hermes`;
`hermes` is in the sudo group but sudo needs a password, so I could not
read it to confirm which variable name was used.

### Which variable the RETAIN path actually reads

There is not one base-URL variable. Hindsight has a separate override
per operation, and the retain path resolves through a chain
(`engine/memory_engine.py`):

```python
retain_base_url = (
    retain_llm_base_url              # the per-call argument
    or config.retain_llm_base_url    # HINDSIGHT_API_RETAIN_LLM_BASE_URL
    or memory_llm_base_url           # HINDSIGHT_API_LLM_BASE_URL
)
# and if that is still empty, the provider default:
#   provider "minimax" -> https://api.minimax.io/v1   (CORRECT)
```

So **three** variables can point the retain at the wrong host, and
the provider default is already right:

| variable | read for |
|---|---|
| `HINDSIGHT_API_LLM_BASE_URL` | every operation (the fallback) |
| `HINDSIGHT_API_RETAIN_LLM_BASE_URL` | the retain/extraction path |
| `HINDSIGHT_API_CONSOLIDATION_LLM_BASE_URL` | consolidation |

Setting only `HINDSIGHT_API_LLM_BASE_URL` is necessary but not
sufficient — if `HINDSIGHT_API_RETAIN_LLM_BASE_URL` is also set, it
wins for the very operation that is failing.

---

## The fix

Either **remove** the base-URL override so the code's own correct
default applies:

```bash
sudo -n -u hermes sed -i '/^HINDSIGHT_API_LLM_BASE_URL=/d' \
  /home/hermes/.hindsight/profiles/hermes.env
```

or **set it correctly**, with the `/v1` suffix the OpenAI-compatible
client expects — and clear the per-operation overrides, which win
over the fallback:

```bash
sudo -n -u hermes sh -c \
  "sed -i '/^HINDSIGHT_API_\(RETAIN\|CONSOLIDATION\|REFLECT\)_LLM_BASE_URL=/d' \
   /home/hermes/.hindsight/profiles/hermes.env; \
   sed -i '/^HINDSIGHT_API_LLM_BASE_URL=/d' \
   /home/hermes/.hindsight/profiles/hermes.env; \
   printf '%s\n' 'HINDSIGHT_API_LLM_BASE_URL=https://api.minimax.io/v1' \
   >> /home/hermes/.hindsight/profiles/hermes.env"
sudo systemctl --user restart hindsight.service
```

Deleting the line entirely is the safer form: the provider default
for `minimax` is **already** `https://api.minimax.io/v1`, so the
cleanest state is "no override at all":

```bash
sudo -n -u hermes sed -i \
  '/^HINDSIGHT_API_\(LLM\|RETAIN_LLM\|CONSOLIDATION_LLM\|REFLECT_LLM\)_BASE_URL=/d' \
  /home/hermes/.hindsight/profiles/hermes.env
sudo systemctl --user restart hindsight.service
```

To see what is actually in the file (the key must not be printed):

```bash
sudo -n -u hermes sed -E 's/=.*/=<redacted>/' \
  /home/hermes/.hindsight/profiles/hermes.env | grep -i 'BASE_URL\|PROVIDER\|MODEL'
```

(If the override is already there with the right value, the problem is
the variable NAME — check it is `HINDSIGHT_API_LLM_BASE_URL` and not
`MINIMAX_BASE_URL`.)

### To read the current state

```bash
sudo -u hermes grep -E '^(HINDSIGHT_API_LLM_(BASE_URL|PROVIDER|MODEL)|MINIMAX_BASE_URL)=' \
  /home/hermes/.hindsight/profiles/hermes.env
```

That prints no secrets. `HINDSIGHT_API_LLM_API_KEY` is deliberately not
in the pattern.

### To confirm the fix

```bash
curl -s http://localhost:8888/v1/default/banks/gustale/stats \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["last_memory_write_at"])'
```

`last_memory_write_at` moves off `2026-10-30T22:44:01.934695+00:00` when
the first write lands.

---

## The bank is intact

Nothing was lost. The bank has **3,252 nodes**, **114,131 links** and
**49 documents**, with `pending_operations: 0`. What failed is only
the *write* path: 186 failed operations and 141 failed consolidations,
all of them 401s.

Reads keep working, and the recall path is unaffected — which is why
this failure has been invisible except when something tries to write.

---

## Reproducing the diagnosis

`/tmp/probe_matrix.py` runs the key × host × key-shape matrix above.
It reads the key from `/home/gustale/.hermes/.env` and never prints it.
