# Hindsight write failure — the daemon calls a China-region MiniMax host

**Date:** 2026-11-06, revised twice on 2026-11-07
**Status:** root-caused, NOT fixed. The fix needs `root` or the `hermes`
user; I have neither. The owner runs 6 commands (below).

**Short version:** the daemon's own error is `invalid api key (2049)`.
`2049` is emitted **only** by `api.minimaxi.com` (and `api.minimax.chat`);
`api.minimax.io` answers 200/1004/404 and never 2049 — even for a
well-formed but wrong key. The key is valid (200 on the global host). So
the daemon is on the **wrong host**, and the value comes from the
**inherited** systemd-manager environment — the base-URL line the owner
deleted from the profile env file was *masking* it, because
`EnvironmentFile=` only shadows the variables it defines.

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

## UPDATE 2026-11-07 (revised twice): the env file is clean; the wrong
## host is INHERITED — and 2049 identifies the host beyond doubt

The section above ("the env file still contains the wrong host") is
**disproven**. The four `HINDSIGHT_API_*_BASE_URL` lines were deleted
correctly; the 291-byte file contains no base-URL line at all, and the
owner restarted the service as `hermes`. The wrong host is still
called.

An earlier revision of this note claimed the **plugin** rewrites the
profile env from `config.json` and restores the China host. **That
claim is also disproven**: reproducing the plugin's own writer
(`_build_embedded_profile_env` + `_materialize_embedded_profile_env`)
against the live config produces the **canonical 291-byte file with no
base URL** — byte-identical to what is on disk. The plugin is not the
culprit.

### The linchpin: `2049` can only come from `api.minimaxi.com`

This is the load-bearing fact, so it was tested exhaustively. The key
is never printed; the matrix is run in Python, reading the key from the
environment.

| key | `api.minimax.io` | `api.minimaxi.com` |
|---|---|---|
| the **real** key | **200 OK** | **401 `invalid api key (2049)`** |
| garbage (`not-a-key`) | 401 `1004` | 401 `1004` |
| **well-formed but wrong** (real key, 1 char mutated) | 401 `1004` | 401 `1004` |
| empty key | 401 `1004` | — |

Two further control tests close the remaining loopholes:

* **Wrong path on the global host** → `404`, never `2049`
  (`api.minimax.io/chat/completions`, `api.minimax.io/v1/messages`).
* **Other MiniMax hosts**: `api.minimax.chat` also emits `2049`;
  `api.minimax.com`, `api.minimax.io.cn`, `api.minimaxi.cn`,
  `openapi.minimax.io` do not resolve or do not emit it.

So:

* **1004** = "that is not a key at all"
* **2049** = "that IS a real MiniMax key, but **this host** does not
  know it"

`api.minimax.io` answers **200 or 1004 or 404 — never 2049**. The
daemon's own error body is `invalid api key (2049)`. **Therefore the
daemon is calling a China-region MiniMax host** (`api.minimaxi.com`,
or `api.minimax.chat`), while holding a key that the global host
accepts with a 200.

The key is not the problem. The host is.

### Where the effective base URL is resolved

```
hindsight_api/config.py:4244   llm_base_url = os.getenv("HINDSIGHT_API_LLM_BASE_URL") or None
hindsight_api/config.py:4330   retain_llm_base_url = os.getenv("HINDSIGHT_API_RETAIN_LLM_BASE_URL") or None
hindsight_api/config.py:4352   reflect_llm_base_url = os.getenv("HINDSIGHT_API_REFLECT_LLM_BASE_URL") or None
hindsight_api/config.py:4366   consolidation_llm_base_url = os.getenv("HINDSIGHT_API_CONSOLIDATION_LLM_BASE_URL") or None

engine/memory_engine.py:2743   retain_base_url = retain_llm_base_url
                                             or config.retain_llm_base_url
                                             or memory_llm_base_url
```

`memory_llm_base_url` falls back to `config.get_llm_base_url()`, and
when that is empty the provider default applies:

```
engine/providers/openai_compatible_llm.py:889
    elif self.provider == "minimax":
        self.base_url = "https://api.minimax.io/v1"     # CORRECT
```

The string `api.minimaxi.com` appears **nowhere** in the installed
`hindsight_api` package (verified by grep over the whole tree: 26
matches for "minimax", all of them either the global default or
LiteLLM's optional China branch, which the active provider does not
use). The wrong host therefore comes from an **explicit override** in
the daemon's environment.

### The env file is clean — and that is the problem

The profile env file is `/home/hermes/.hindsight/profiles/hermes.env`
(owner `hermes`, mode `0600`, **291 bytes**, mtime 14:01:13). Byte
arithmetic (the plugin's writer is a plain `"".join(f"{k}={v}\n")`)
with the live key length of **125** chars shows the only layout that
produces 291 bytes is:

```
HINDSIGHT_API_LLM_PROVIDER=minimax
HINDSIGHT_API_LLM_API_KEY=<125 chars>
HINDSIGHT_API_LLM_MODEL=MiniMax-M3
HINDSIGHT_API_LOG_LEVEL=info
HINDSIGHT_EMBED_DAEMON_IDLE_TIMEOUT=300
```

**No base-URL line.** The 344-byte backup is the same set **plus**
`HINDSIGHT_API_LLM_BASE_URL=https://api.minimax.io/v1` (exactly 53
bytes) — i.e. the deleted line pointed at the **correct** host.

**That is the mechanism.** `EnvironmentFile=` only *shadows* the
variables it defines. The deleted line was **masking** an inherited
China-host value; deleting it exposed the inherited value instead of
fixing it.

Proven empirically on my own systemd user manager (`/tmp/prove_systemd_precedence.sh`):

```
A) unit WITHOUT EnvironmentFile  -> seen=INHERITED_VALUE
B) unit WITH    EnvironmentFile  -> seen=FILE_VALUE
```

So with the file's base-URL line **present**, the daemon gets the
correct global host. With it **absent**, the daemon falls back to
whatever the manager environment holds — and that is the China host.

### Ruled out, with evidence

| candidate | how it was ruled out |
|---|---|
| the key is bad | real key → **200** on `api.minimax.io` |
| the model name | `MiniMax-M3` works; the Aug 25 log shows the same model succeeding |
| Hindsight's code points at the China host | grep: 0 occurrences of `api.minimaxi.com` in `hindsight_api` |
| the **profile env file** | 291 B = canonical set, no base-URL line |
| the **bank config** (`GET /banks/gustale/config`) | 1,647 bytes; no `llm_base_url`, no `minimax` |
| the **database** (all 25 tables, `::text ilike '%minimax%'`) | **no table contains the string 'minimax'** |
| a **`.env`** discovered by `find_dotenv(usecwd=True)` | `/home/hermes/.env`, `/home/.env`, `/.env`, `/home/hermes/hindsight/.env` — all confirmed absent |
| `/etc/environment`, `/etc/profile.d/*`, `~/.profile`, `~/.bashrc`, `~/.config/environment.d/` | all readable, none mentions `HINDSIGHT`/`MINIMAX` |
| `/etc/environment.d/` | only `90qt-a11y.conf` (19 bytes) |

### What the owner must run (the only unreadable link)

`/home/hermes/.hermes` is mode `0700` and owned by `hermes`; the
daemon's `/proc/<pid>/environ` and `/proc/<pid>/cwd` are unreadable by
uid 1004, and `sudo -n` needs a password. So the *inherited* value
cannot be read from this account — only its **effect** was measured.

The daemon's environment comes from the systemd **user manager** for
uid 1001, and the manager's environment is seeded from the login
session. Run these as `hermes`:

```bash
# 1. THE inherited value (this is the source, if set)
sudo -n -u hermes systemctl --user show-environment \
  | grep -E 'HINDSIGHT|MINIMAX|BASE_URL'

# 2. The plugin config (a second possible source)
sudo -n -u hermes cat /home/hermes/.hermes/hindsight/config.json
sudo -n -u hermes cat /home/hermes/.hindsight/config.json   # legacy path
```

If (1) shows `HINDSIGHT_API_LLM_BASE_URL=https://api.minimaxi.com/v1`
(or any China host), that is the bug. Clear it in the manager
environment **and** restore the explicit global value in the profile
file, so the file shadows it again:

```bash
# 3. Remove the bad value from the manager environment
sudo -n -u hermes systemctl --user unset-environment HINDSIGHT_API_LLM_BASE_URL
sudo -n -u hermes systemctl --user unset-environment HINDSIGHT_API_RETAIN_LLM_BASE_URL
sudo -n -u hermes systemctl --user unset-environment HINDSIGHT_API_REFLECT_LLM_BASE_URL
sudo -n -u hermes systemctl --user unset-environment HINDSIGHT_API_CONSOLIDATION_LLM_BASE_URL

# 4. ALSO delete it from the login session, or it comes back on next login
#    (edit ~/.profile / ~/.bashrc / PAM, wherever it is exported)

# 5. Pin the correct host in the profile env file (the file shadows the manager)
sudo -n -u hermes sh -c \
  "sed -i '/^HINDSIGHT_API_.*_LLM_BASE_URL=/d' /home/hermes/.hindsight/profiles/hermes.env; \
   printf '%s\n' 'HINDSIGHT_API_LLM_BASE_URL=https://api.minimax.io/v1' \
   >> /home/hermes/.hindsight/profiles/hermes.env"

# 6. Restart the unit that owns the daemon
sudo -n -u hermes systemctl --user restart hindsight.service
```

Steps 3+5 are belt and braces: **either** alone fixes it. Step 5 is
the one that is guaranteed to win, because the `EnvironmentFile` value
takes precedence over the manager environment (proved above). Step 3
is what stops the bad value from being inherited by anything else.

Note the plugin rewrites the profile env file from `config.json` when
the two disagree (`__init__.py:1422-1427`). If the file's base-URL
line disappears again after a restart, `config.json` carries the
China host and step 2 must be fixed first.

### Confirming the fix

```bash
# the daemon's own log line must show the global host
sudo -n -u hermes journalctl --user -u hindsight.service -n 200 --no-pager \
  | grep 'client initialized: provider=minimax'

# then the write test, and the timestamp
curl -s http://localhost:8888/v1/default/banks/gustale/stats \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["last_memory_write_at"])'
```

`last_memory_write_at` must move off `2026-10-30T22:44:01.934695+00:00`.

### A correction to an earlier claim in this note

An earlier revision asserted the daemon "is **not** the `hindsight.service`
unit as written" because it is a `Popen` child. **That was wrong**, and
it was tested. A `Popen`'d child inherits its parent's cgroup:

```
B) a Popen'd child of a shell in hermes-gateway.service
   -> /user.slice/user-1004.slice/user@1004.service/app.slice/hermes-gateway.service
```

The Hindsight daemon's cgroup is
`/user.slice/user-1001.slice/user@1001.service/app.slice/hindsight.service`
— a **named unit**, which a `Popen` child could not produce. The
daemon **is** the `hindsight.service` unit, started by systemd, and it
inherits the manager's environment plus the unit's `EnvironmentFile`.
Its PPID is `systemd --user` (pid 1142) because the unit's `Type=simple`
process is managed directly.

---

## The bank is intact

Nothing was lost. The bank has **3,252 nodes**, **114,131 links** and
**49 documents**, with `pending_operations: 0`. What failed is only
the *write* path: 228 failed operations in the `gustale` bank
(`bank_stats_cache`), all of them 401s.

Reads keep working, and the recall path is unaffected — which is why
this failure has been invisible except when something tries to write.

The `llm_requests` table holds **165 rows, all errors, all `2049`**,
spanning `2026-11-06T08:09:18Z` → `2026-11-07T08:41:30Z`, in two
scopes: `retain_extract_facts` (163) and `reflect_tool_call` (2). The
table was truncated when the DB was reinstalled on 2026-10-17, so the
failure predates the first row in it.

---

## Reproducing the diagnosis

* `/tmp/linchpin.py` — the key × host × key-shape matrix, including
  the well-formed-but-wrong key case that distinguishes `1004` from
  `2049`.
* `/tmp/path_matrix.py` — wrong paths on both hosts, and the
  Anthropic-style wire.
* `/tmp/full_error.py` — the daemon's full error body, a recall, and
  `last_memory_write_at`.
* `/tmp/hs_db4.py` — every table in the Hindsight database, searched
  for the string `minimax`.
* `/tmp/prove_systemd_precedence.sh` — `EnvironmentFile` beats the
  inherited manager environment.

None of them print the key.
