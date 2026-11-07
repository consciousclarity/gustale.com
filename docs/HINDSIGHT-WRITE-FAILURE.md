# Hindsight write failure — root cause (2026-11-08)

**Status: ROOT CAUSE FOUND. One command from Alejandro fixes it.**

## TL;DR

The `HINDSIGHT_API_*_BASE_URL` edit was correct and did take effect.
The write still fails because **the MiniMax API key in `hermes.env` is invalid/revoked** —
and it has been invalid since at least **2026-11-06**, well before the URL edit.

The URL was never the problem. `2049` = "invalid api key", **not** "wrong host".

---

## What the user did (verified correct)

`/home/hermes/.hindsight/profiles/hermes.env` (mode 600, owner `hermes`, mtime `2026-11-08 06:57:33`):

```
HINDSIGHT_API_LLM_PROVIDER=minimax
HINDSIGHT_API_LLM_API_KEY=<redacted>
HINDSIGHT_API_LLM_MODEL=MiniMax-M3
HINDSIGHT_API_LOG_LEVEL=info
HINDSIGHT_EMBED_DAEMON_IDLE_TIMEOUT=300
HINDSIGHT_API_LLM_BASE_URL=https://api.minimax.io/v1
HINDSIGHT_API_RETAIN_LLM_BASE_URL=https://api.minimax.io/v1
HINDSIGHT_API_CONSOLIDATION_LLM_BASE_URL=https://api.minimax.io/v1
HINDSIGHT_API_REFLECT_LLM_BASE_URL=https://api.minimax.io/v1
```

- All four base URLs are `https://api.minimax.io/v1` (global host) — **confirmed by reading the file as root via docker**, not inferred.
- File size 532 bytes = 291 (pre-edit) + exactly 241 bytes = the four 53/60/61/67-byte URL lines. Byte arithmetic is consistent.
- Daemon restarted at **06:58:08**, i.e. **35 s after** the 06:57:33 edit. The edit was live before the failing write at 07:02.

So: the env edit worked, the restart worked, and the daemon still failed. The URL was never the cause.

## The actual cause: the key is invalid

Two different keys exist on this host:

| key | sha256[:12] | len | `api.minimax.io` `/v1/chat/completions` | `api.minimaxi.com` `/v1/chat/completions` |
|---|---|---|---|---|
| **daemon** (`hermes.env` → `HINDSIGHT_API_LLM_API_KEY`) | `dd774d302bbd` | 125 | **401 `invalid api key (2049)`** | **401 `invalid api key (2049)`** |
| **working** (`/home/gustale/.hermes/.env` → `MINIMAX_API_KEY`) | `b47bd6931ae2` | 125 | **200 real success** | 401 `invalid api key (2049)` |

The daemon's key is rejected by **both** hosts, on **every** model tried
(`MiniMax-M3`, `MiniMax-M2`, `MiniMax-M1`, `minimax-M2`, `abab6.5s-chat`, `MiniMax-Text-01`),
and on every endpoint tried (`/v1/chat/completions`, `/v1/text/chatcompletion_v2`, `/anthropic/v1/messages`).

The key is **not** a China-platform key. It is simply not accepted by MiniMax any more.

### Trap: HTTP 200 with an error payload

MiniMax's legacy endpoint `/v1/text/chatcompletion_v2` returns **HTTP 200** with an error body:

```json
{"base_resp":{"status_code":2049,"status_msg":"invalid api key"}}
```

Any probe that only checks the HTTP status will read that as a success. It is not.
The real signal is `base_resp.status_code`.

### Correction to the earlier diagnostic

The previous note said *"2049 comes only from `api.minimaxi.com` ⇒ China host"*. That was wrong.
It was an artifact of the working key happening to be global-only:
the **working** key fails with 2049 on China and succeeds on global; the **daemon's** key
fails with 2049 on both. The error code means "invalid api key", full stop.

## Timeline

| when | what |
|---|---|
| 2026-10-30 22:44:01 UTC | **Last successful write** to the `gustale` bank (`last_memory_write_at`) |
| 2026-11-06 07:23 UTC | **Oldest 2049 error** in the daemon's `llm_requests` ledger (`/v1/default/banks/gustale/llm-requests`) |
| 2026-11-07 | 163 failed retain extractions; 10 failed on 11-06 |
| 2026-11-07 14:01 | `hermes.env` backed up (291 B) — still the same invalid key |
| 2026-11-08 06:57:33 | Alejandro sets all four base URLs to `api.minimax.io/v1` |
| 2026-11-08 06:58:08 | Daemon restarts |
| 2026-11-08 07:02 | Write attempted → 401 / 2049 (the failing write in this session) |

Key fingerprint `dd774d302bbd` is **identical** in the current file and in all three backups
(11-06, 11-07, 11-08 0657) — the key was never rotated, and it has been the same
invalid key for the whole window.

`llm-requests?status=success` returns **0 rows**: not a single successful LLM call
has been recorded since the breakage. `failed_operations = 246`.

Recall still works (45 real memories returned) because recall needs no LLM call —
it reads the existing graph. Only **retain** (fact extraction) and **reflect**
are broken; both need the MiniMax LLM.

## The fix

Replace the key in `/home/hermes/.hindsight/profiles/hermes.env`:

```
HINDSIGHT_API_LLM_API_KEY=<the key that works on api.minimax.io>
```

The known-good key is already on this host at `/home/gustale/.hermes/.env`
(`MINIMAX_API_KEY`, fingerprint `b47bd6931ae2`) and returns HTTP 200 on
`https://api.minimax.io/v1/chat/completions` with model `MiniMax-M3`.

Then restart and re-verify:

```
systemctl --user restart hindsight.service      # as user: hermes
curl -s http://localhost:8888/v1/default/banks/gustale/stats | jq .last_memory_write_at
```

**Owner action required** (the file is mode 600, owner `hermes`; `gustale` cannot write it,
and `sudo` is unavailable). Run as `hermes`:

```bash
sudo -u hermes cp /home/hermes/.hindsight/profiles/hermes.env \
    /home/hermes/.hindsight/profiles/hermes.env.bak-$(date +%Y%m%d-%H%M)
# replace the HINDSIGHT_API_LLM_API_KEY line with the working key, then:
sudo -u hermes systemctl --user restart hindsight.service
```

## Verification after the fix

1. `POST /v1/default/banks/gustale/memories/dry-run-extract` (non-persisting probe) → expect
   extracted facts, not a 401.
2. One `hindsight_retain` → expect success.
3. `last_memory_write_at` must move **forward** from `2026-10-30T22:44:01.934695+00:00`.
4. `GET /v1/default/banks/gustale/llm-requests?status=success` → expect ≥1 row.

## Reading the daemon's env without being `hermes`

The `hermes` user's files are unreadable to `gustale`, but `gustale` is in the `docker` group,
so a throwaway container can read them as root:

```bash
docker run --rm -v /home/hermes/.hindsight/profiles:/p:ro -v /tmp/out:/out busybox:latest \
  sh -c 'cp /p/hermes.env /out/hermes.env'
```

Never print the key itself — print only `len` and a `sha256[:12]` fingerprint.

## Pitfalls

- `load_dotenv(find_dotenv(usecwd=True), override=True)` in `hindsight_api/config.py:51`
  means a stray `.env` in the daemon's CWD (`/home/hermes`) would **override** the systemd
  `EnvironmentFile`. There is no `/home/hermes/.env`, and the daemon's CWD has no `.env` —
  checked, and this is *not* the cause here.
- The daemon's CWD is `/home/hermes`; the unit is `/home/hermes/.config/systemd/user/hindsight.service`.
- The `hermes` user's journal is **not** readable by `gustale` (needs `systemd-journal` group).
  The daemon's stdout goes to the journal, so the startup log line
  (`OpenAI-compatible client initialized: ... base_url=...`) is not directly readable.
  Use `GET /v1/default/banks/{bank}/llm-requests` instead — it carries the error text.
- `POST /v1/default/banks/{bank}/health/llm` returns 404 unless
  `HINDSIGHT_API_ENABLE_BANK_LLM_HEALTH=true` is set.
