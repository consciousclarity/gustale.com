# GEEKOM migration — the `gustale` Hermes profile inventory

**Prepared:** 2026-11-08
**For:** the move of the `gustale` Hermes profile from this VPS to the
**GEEKOM (WSL2)**.
**Why it is now the priority:** docker on this VPS is **root access**
(Rule 3, `docs/RULES.md`), so this host is no longer a place where the
agent should hold production credentials. Moving the profile off it
removes the temptation *and* the capability.

**Scope of this document:** an inventory of **files**, **secret names
only**, and **which items touch production**. It is a *plan*, not an
execution — no file was moved, copied or deleted.

---

## 0. The three things to decide first

| question | why it matters |
|---|---|
| **Which machine becomes the Telegram bot's host?** | `TELEGRAM_BOT_TOKEN` is a single token; two processes polling the same token fight over updates. Exactly one host may hold the gateway. |
| **Does the GEEKOM keep the VPS's `gustale` repo checkout, or is it a fresh clone?** | The repo is **not** part of the profile. It should be a fresh clone on the GEEKOM, not a copy of this working tree. |
| **Does anything stay on the VPS?** | Yes: the **live database** and the **deploy pipeline** live here. Only the *agent* moves. |

---

## 1. The profile inventory — `~/.hermes/`

Total on disk: **~1.32 GB**, of which **~897 MB is one SQLite file**
(`state.db`) and **~247 MB is the `skills/` + `node/` trees**, both of
which are **rebuildable**. The genuinely irreplaceable content is
**~25 KB**.

### 1.1 MUST MOVE — identity, config and secrets

| file | size | what it is | touches production? |
|---|---|---|---|
| `.env` | 5,333 | **the secrets file** — 33 variables (§2) | **YES** — several |
| `config.yaml` | 6,675 | providers, channels, aux slots, cron, approvals | **YES** — it points at the live Telegram channel and the production provider endpoints |
| `auth.json` | 3,464 | provider auth tokens (OAuth refresh tokens etc.) | **YES** — it *is* a credential |
| `SOUL.md` | 514 | the agent's persona/instructions | no — but **not reproducible** |
| `channel_directory.json` | 215 | chat → channel mapping | **YES** — it names the production Telegram chat |
| `github-app/gustale-bot.pem` | 1,675 | **the GitHub App private key** (mode 600) | **YES** — it can push to `consciousclarity/gustale.com` |
| `hindsight/config.json` | 160 | the memory bank config (`api_url`, `bank_id`) | **YES** — it points at the memory service |
| `memories/MEMORY.md` | 5,115 | the persistent memory | no — but **not reproducible** |
| `memories/USER.md` | 1,734 | the user profile | no — but **not reproducible** |
| `cron/jobs.json` | 1,332 | the one scheduled job | **YES** — it delivers to Telegram |
| `scripts/provider_probe.py` | 9,220 | the cron job's script | **YES** — it calls Telegram + the model providers |
| `scripts/sync_minimax_oauth_token.py` | 3,538 | refreshes the MiniMax OAuth token into the live config | **YES** — it writes the production credential |
| `scripts/restart_gateway.sh` | 458 | restarts the gateway | **YES** — it restarts the production bot |
| `plugins/session-guard/` | 60,825 | the session-guard plugin | no |
| `skills/` | 61,358,373 | the skill library | no — **rebuildable, but 61 MB** |
| `session_guard/` | 779 | the session-guard's own state | no |

### 1.2 MOVE IF THE HISTORY MATTERS — state

| file | size | note |
|---|---|---|
| `state.db` | **896,950,272** | the session/message store. **897 MB.** Everything the agent has ever said is in here. |
| `state.db-shm` / `state.db-wal` | 1.5 MB / 2.3 MB | SQLite sidecars — copy only with the DB, and only while stopped |
| `sessions/` | 28,636,425 | per-session JSON mirrors of the above |
| `sessions/` history | — | `session_search` reads from `state.db`; without it, **the history is gone** |
| `kanban.db` | 118,784 | the kanban board |
| `verification_evidence.db` | 159,744 | the verification evidence store |
| `hook_outputs/` | 3,980,709 | hook output logs |
| `logs/` | 17,240,583 | agent logs |
| `backups/` | 190,868 | config + `.env` backups (7 files, §2.3) |

**The decision to make:** `state.db` is 897 MB of session history. Copying
it is cheap and lossless; not copying it loses `session_search`. My
recommendation: **copy it** — it is the one thing that cannot be
reconstructed, and 897 MB is not a burden for a WSL2 volume.

### 1.3 REBUILDABLE — do not copy

| item | size | why it is safe to drop |
|---|---|---|
| `bin/` | 88,861,744 | the Hermes tool venvs — reinstalled by the setup |
| `node/` | 196,750,507 | the Node runtime tree — reinstalled |
| `cache/` | 8,275,069 | HTTP/model caches |
| `browser_screenshots/` | 1,631,343 | transient |
| `audio_cache/`, `image_cache/` | 0 | empty |
| `models_dev_cache.json` | 5,973,434 | a model catalogue cache |
| `provider_models_cache.json` | 1,874 | ditto |
| `ollama_cloud_models_cache.json` | 450 | ditto |
| `.skills_prompt_snapshot.json` | 39,509 | regenerated on first run |
| `config.yaml.bak-*` (9 files) | ~28 KB | superseded by the live `config.yaml` |
| `gateway.pid` / `.lock` / `gateway_state.json` | 456 | **runtime state — do not copy a live gateway's PID file** |
| `auth.lock`, `*.lock` | 0 | lock files |

---

## 2. Secrets — NAMES ONLY

**No value appears in this document, and none appeared in the chat.**

### 2.1 `~/.hermes/.env` — 33 variables

**Group 1 — PRODUCTION-TOUCHING. These are the reason for the move.**

| name | what it is | production? |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | the Telegram bot token | **YES** — *the* single-host credential |
| `TELEGRAM_ALLOWED_USERS` | who may DM the bot | **YES** |
| `TELEGRAM_HOME_CHANNEL` | the production chat id | **YES** |
| `GUSTALE_API_BASE` | the gustale.com API base URL | **YES** |
| `GUSTALE_API_EMAIL` | the gustale.com account | **YES** |
| `GUSTALE_API_PASSWORD` | the gustale.com password | **YES** |
| `MINIMAX_API_KEY` | the model provider key | **YES** — it is the key that just fixed Hindsight |
| `MINIMAX_BASE_URL` | the model provider endpoint | **YES** |
| `MINIMAX_OAUTH_MAX_TOKEN` | the OAuth token for the Max plan | **YES** |
| `ANTHROPIC_API_KEY` | a model provider key | yes |
| `OPENAI_API_KEY` | a model provider key | yes |
| `DEEPSEEK_API_KEY` | a model provider key | yes |
| `KIMI_API_KEY` | a model provider key | yes |
| `COMPOSIO_API_KEY` | a tool-service key | yes |
| `FIRECRAWL_API_KEY` | a scraping-service key | yes |
| `BRAVE_API_KEY` | a search key — **currently empty** | — |

**Group 2 — NOT production. Third-party services and local tuning.**

| name | what it is | production? |
|---|---|---|
| `CAMOFOX_URL` | the browser-automation endpoint | no |
| `BROWSERBASE_PROXIES` | browser proxies | no |
| `BROWSERBASE_ADVANCED_STEALTH` | browser flag | no |
| `BROWSER_SESSION_TIMEOUT` | browser tuning | no |
| `BROWSER_INACTIVITY_TIMEOUT` | browser tuning | no |
| `FIRECRAWL_API_URL` | the scraping-service endpoint | no |
| `TERMINAL_MODAL_IMAGE` | the terminal's container image | no |
| `TERMINAL_TIMEOUT` | terminal tuning | no |
| `TERMINAL_LIFETIME_SECONDS` | terminal tuning | no |
| `TERMINAL_ENV` | terminal env passthrough | no |
| `WEB_TOOLS_DEBUG` | debug flag | no |
| `VISION_TOOLS_DEBUG` | debug flag | no |
| `MOA_TOOLS_DEBUG` | debug flag | no |
| `IMAGE_TOOLS_DEBUG` | debug flag | no |
| `WHATSAPP_MODE` | disabled channel | no |
| `WHATSAPP_ALLOWED_USERS` | disabled channel | no |
| `WHATSAPP_ENABLED` | disabled channel | no |

### 2.2 Other credential-bearing files

| path | what it is | production? |
|---|---|---|
| `github-app/gustale-bot.pem` | the **GitHub App private key** (mode 600) | **YES** — it can push to `consciousclarity/gustale.com` and open PRs |
| `auth.json` | provider OAuth refresh tokens | **YES** |
| `hindsight/config.json` | `api_url`, `bank_id` for the memory service | **YES** — it points at the memory service |
| `config.yaml` → `providers.*.key_env` | *names* the env vars; holds no values | references only |

### 2.3 Backups that also hold secrets — `~/.hermes/backups/`

| file | holds |
|---|---|
| `.env.bak-20261029-110144` | a full copy of the old `.env` |
| `.env.bak-20261029-113514-pre-quarantine` | a full copy of the old `.env` |
| `config.yaml.bak-20261017-172936` | an old config (**owned by root**) |

**Do not copy the `.env` backups to a new host.** They are superseded
and they multiply the number of places a secret exists. Leave them on
the VPS, or delete them there once the GEEKOM is confirmed working.

### 2.4 What does NOT contain a secret

`SOUL.md`, `memories/*.md`, `cron/jobs.json`, `scripts/*.py` (the
provider probe reads `MINIMAX_API_KEY` from the environment, it does
not embed it), `kanban.db`, and every `config.yaml.bak-*` except the
root-owned one above.

---

## 3. What touches production — the short list

**The production systems are these five, and only these five:**

| # | system | where it lives | what the profile holds for it |
|---|---|---|---|
| 1 | **the `gustale.com` live Postgres** | this VPS, `shared-postgres` container | **nothing** — no credential, no DSN. Access is via `scripts/dbq.sh` in the repo, which uses the host's own auth. |
| 2 | **the `gustale.com` API** | gustale.com | `GUSTALE_API_BASE`, `GUSTALE_API_EMAIL`, `GUSTALE_API_PASSWORD` |
| 3 | **the GitHub repo** `consciousclarity/gustale.com` | github.com | `github-app/gustale-bot.pem` — can push, open PRs |
| 4 | **the Telegram bot** | api.telegram.org | `TELEGRAM_BOT_TOKEN` — *the* single-host credential |
| 5 | **the memory service** | `localhost:8888` on this VPS | `hindsight/config.json` → `api_url` |

**Plus the deploy path**, which is in the **repo**, not the profile:
`/home/deploy/gustale-rebuild/{build-web-live.sh,rebuild-web-live.sh}`.
These stay on the VPS — they deploy the web build to production.

### 3.1 The one genuinely hard constraint

**The Telegram bot token is single-host.** If the gateway runs on the
GEEKOM *and* anything still polls the same token on this VPS, the two
will steal each other's updates and the bot will appear to drop
messages at random. **The gateway must run in exactly one place.**

### 3.2 The memory service

`hindsight/config.json` points at `api_url` on **this VPS**
(`localhost:8888`). If the profile moves to the GEEKOM, that URL is
either unreachable or has to be the VPS's LAN/public address. **This
needs an answer before the cutover** — and it is the item most likely
to be forgotten.

### 3.3 What does NOT move and does NOT need to

- the live database and the shared Postgres container — they stay here;
- the `gustale.com` repo working tree — the GEEKOM should **clone**
  it, not receive a copy of a working tree with local state;
- the test Postgres container (`gustale-test-postgres`) — it is a local
  dev convenience and Rule 3 permits its use here;
- the deploy scripts — they stay here.

---

## 4. The cutover, in order

1. **Decide the three questions in §0.** Especially the Telegram
   single-host constraint and the memory-service URL.
2. **Install Hermes on the GEEKOM** (WSL2) and let it build its own
   `bin/` and `node/` trees. Do not copy them.
3. **Copy the MUST-MOVE set** (§1.1) — 8 files, ~25 KB, plus the
   `skills/` tree if the GEEKOM should carry the same skills.
   **Copy `.env` last**, and with `chmod 600`.
4. **Copy `state.db`** (897 MB) *with the gateway stopped*, or copy it
   and accept the session history is stale at the cutover instant.
5. **Copy `memories/`** and `SOUL.md` — small and irreplaceable.
6. **Do NOT copy** the `.env` backups, the `config.yaml.bak-*` files,
   the lock files, or `gateway.pid`.
7. **Start the gateway on the GEEKOM. Verify it answers.**
8. **Stop the gateway on this VPS** — *then*, not before. The moment
   the GEEKOM's gateway is healthy is the moment this one's must stop.
9. **Point the memory service at a reachable URL** (§3.2) and verify one
   write and one recall.
10. **Verify the GitHub App key works from the GEEKOM** — the PEM is
    mode 600 and the App's installation is tied to the repo, not the
    host, so this should work; verify rather than assume.
11. **Leave the live DB alone.** No credential for it moves, because
    there is none in the profile.

---

## 5. Open questions for the owner

1. **Which host runs the Telegram gateway after the move?** The GEEKOM,
   or here?
2. **Is the memory service exposed to the GEEKOM** (LAN/public URL), or
   does the GEEKOM get its own instance? If the latter, the **bank
   `gustale`** and its **45+ memories** should be copied too — that is
   a second database, and it is not in this profile.
3. **Does `state.db` (897 MB) come along?** My recommendation: yes.
4. **Do the `.env` backups come along, or get deleted here?** My
   recommendation: delete them here.
5. **Does the `gustale` repo working tree come along?** My
   recommendation: no — clone it fresh on the GEEKOM.
6. **Should the GEEKOM also take the cron job** (the provider health
   probe, `17 7 * * *`)? It is the only scheduled job, and it delivers
   to Telegram — so it must not run in two places.

---

**One thing this inventory does not do:** it does not touch the VPS's
other `hermes` user's profile (`/home/hermes/.hindsight/`), which is
root-owned and belongs to the **memory daemon**, not to the `gustale`
agent. That daemon is a separate service; see
`docs/HINDSIGHT-WRITE-FAILURE.md`.
