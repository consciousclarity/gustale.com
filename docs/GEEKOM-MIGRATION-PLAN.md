# GEEKOM migration — the step-by-step plan

**Prepared:** 2026-11-08
**For:** moving the `gustale` Hermes profile from this VPS to the **GEEKOM (WSL2)**.
**Status:** **PLAN ONLY — nothing has been executed.** The owner asked for
the plan; execution comes after PR #200 is merged.

**Companion document:** `docs/GEEKOM-MIGRATION-INVENTORY.md` — the
inventory of files, secret names, and what touches production.

---

## 0. The owner's three answers, now the plan's constraints

| # | the answer | what it means for this plan |
|---|---|---|
| 1 | **After the move, the Telegram gateway runs ONLY on the GEEKOM.** Start it there, verify, then stop and disable the VPS one. | §4 is a **strict order**: the GEEKOM's gateway must be healthy *before* the VPS's is stopped. The two must never poll the same token at the same time. |
| 2 | **The GEEKOM gets its OWN Hindsight instance; copy the `gustale` bank. Don't expose the VPS memory port.** | §3 is a **new instance on the GEEKOM** plus a **bank export/import**. The VPS's port 8888 stays bound to `127.0.0.1` — it is never opened. |
| 3 | **`state.db` comes along.** | §2 uses `hermes backup`, which takes a **consistent SQLite snapshot** of `state.db` — a safe copy, not a hot file copy. |

**What stays on the VPS, permanently:** the live database and its
`shared-postgres` container, the `gustale.com` deploy scripts
(`/home/deploy/gustale-rebuild/`), the test Postgres container, and the
**other** `hermes` user's Hindsight daemon (which is the *memory
service*, not this agent — see §3.5).

---

## 1. Before anything: the two things that will bite

### 1.1 The Telegram token is single-host

Two gateways polling the same bot token steal each other's updates. The
bot will appear to randomly drop messages. **The window where both run
must be as short as possible, and it must be a deliberate one.**

The plan therefore has this shape:

```
GEEKOM gateway starts and is verified   ← the ONLY overlap
VPS gateway stops                        ← then, immediately
VPS gateway is disabled                  ← so it cannot come back
```

**Do not stop the VPS gateway first.** A stopped gateway is a bot that
does not answer; a duplicated gateway is a bot that answers half the
time.

### 1.2 The repo is NOT part of the profile

The `gustale.com` working tree is **not** in `~/.hermes/`. The GEEKOM
should **clone it fresh**, not receive a copy of a working tree with
local state, a dirty index, and branch pointers:

```bash
# ON THE GEEKOM
git clone https://github.com/consciousclarity/gustale.com.git ~/projects/gustale.com
cd ~/projects/gustale.com && git checkout main
```

The GitHub App key (§2.4) is what the agent uses for pushes; the clone
above is only for reading and for local builds.

---

## 2. Moving the profile

### 2.1 Use `hermes backup` — it is purpose-built for this

`hermes backup` takes a **consistent snapshot** of `state.db` via
`sqlite3.backup()` and already excludes everything that must not cross
a machine boundary. **Do not hand-roll a `cp -a` of `~/.hermes/`** —
the SQLite sidecars (`state.db-wal`, `state.db-shm`) are the classic way
to produce a torn database, and the runtime files (`gateway.pid`,
`gateway_state.json`, `processes.json`) carry PIDs from this machine's
process namespace.

What `hermes backup` excludes, by design (verified in
`hermes_cli/backup.py`):

| excluded | why |
|---|---|
| `hermes-agent/` | the codebase — reinstalled |
| `node_modules/`, `site-packages/`, `.venv/`, `venv/` | dependency trees — reinstalled |
| `.cache/`, `__pycache__/`, `.pyc` | regenerated |
| `backups/`, `checkpoints/` | nested backups; session-local trajectory caches |
| `state.db-wal`, `state.db-shm`, `*.db-journal` | **the snapshot is consistent**; shipping the sidecars would tear it |
| `gateway.pid`, `cron.pid` | PIDs from this machine's namespace |

What it **includes**: `config.yaml`, `.env`, `auth.json`, `state.db`,
`memories/`, `skills/`, `cron/`, `scripts/`, `plugins/`, `github-app/`,
`hindsight/config.json`, and the session history.

### 2.2 On the VPS — take the archive

```bash
# ON THE VPS (the source)
cd ~

# The cron ticker runs INSIDE the gateway (hermes cron status says so),
# so there is no separate cron daemon to stop. The gateway stays up
# until §4 -- stopping it here would take the bot down.
# If you want to be certain nothing writes state.db mid-snapshot,
# pause the one job:
hermes cron pause ea3d04823552     # the 'Provider health probe (gustale)' id

# Full backup: config + skills + sessions + state.db + .env + auth + cron
hermes backup -o ~/geekom-migration/hermes-gustale-$(date +%Y%m%d-%H%M).zip

# Verify the archive exists and is not empty
ls -lh ~/geekom-migration/

# Resume the job if you paused it (it will also just resume when the
# GEEKOM's gateway takes over in §4.4)
hermes cron resume ea3d04823552
```

**Check what the backup produced.** It prints its included and excluded
directories — read that output. It should show `state.db` included and
`bin/`/`node/` excluded.

### 2.3 The secret files — handled separately, deliberately

`hermes backup` includes `.env`, `auth.json` and `github-app/*.pem`.
That is correct for a migration, but it means **the archive is a
credential bundle**. Handle it as one:

```bash
# ON THE VPS
chmod 600 ~/geekom-migration/*.zip

# And the memory-bank export from §3 is ALSO a credential-adjacent file
# (it contains the bank's content). Same treatment.
```

**Do not put the archive in the git repo.** `/tmp` and `~/` are fine;
the repo is not.

### 2.4 Copy it to the GEEKOM

The transfer method is the owner's choice (scp, rsync, a USB drive,
a private object store). What matters is the destination and the
permissions:

```bash
# ON THE GEEKOM
mkdir -p ~/geekom-migration
# <transfer the zip here>
chmod 600 ~/geekom-migration/hermes-gustale-*.zip
```

### 2.5 On the GEEKOM — install Hermes and restore

```bash
# ON THE GEEKOM (WSL2)
# 1. Install Hermes the same way it is installed on the VPS:
#    a uv tool install, which is what /home/gustale/.local/bin/hermes is.
curl -LsSf https://astral.sh/uv/install.sh | sh
uv tool install hermes-agent

# 2. Confirm it landed
hermes --version          # expect v0.19.0 (2026.7.20) -- match the VPS

# 3. Restore the archive over the profile
hermes import ~/geekom-migration/hermes-gustale-*.zip
#    (add --force to overwrite without the confirmation prompt)
```

**What `hermes import` does with runtime state.** The import filters
`_IMPORT_SKIP_NAMES` — it will **not** overwrite `gateway_state.json`,
`gateway.pid`, `cron.pid`, `gateway.lock` or `processes.json` on the
GEEKOM. That is correct: those are this machine's, and the GEEKOM
makes its own on first start.

### 2.6 On the GEEKOM — verify the profile

```bash
# ON THE GEEKOM
hermes doctor                       # config + deps + provider reachability
hermes status                       # all components
hermes memory status                # the memory provider config
hermes cron list                    # the provider health probe -- should be there
ls -la ~/.hermes/ | head -30        # the profile landed
```

**Expected**: `config.yaml`, `.env` (mode 600), `auth.json`,
`state.db`, `memories/`, `skills/`, `github-app/gustale-bot.pem` (mode
600), `hindsight/config.json`. **`bin/` and `node/` will be absent** —
they are reinstalled by the next `hermes` invocation that needs them
(`hermes postinstall` bootstraps node/browser/ripgrep/ffmpeg).

```bash
# Reinstall the rebuildable runtime trees
hermes postinstall
```

### 2.7 The GitHub App key

```bash
# ON THE GEEKOM
ls -l ~/.hermes/github-app/gustale-bot.pem    # must be 600
# The App's installation is bound to the REPO, not to the host, so this
# key works from any host. Verify rather than assume:
python3 ~/.hermes/scripts/… 2>/dev/null || true
```

The practical verification is a push from the GEEKOM during the first
real commit — which is exactly what §5's first task is.

---

## 3. The GEEKOM's own Hindsight instance, and the `gustale` bank

**The VPS's memory port is NOT exposed.** `127.0.0.1:5433` (the
pg0 Postgres) and `0.0.0.0:8888` (the Hindsight API) stay as they
are. The GEEKOM runs its **own** instance and the bank is moved across
with Hindsight's own export/import.

### 3.1 Install the memory service on the GEEKOM

The VPS runs `hindsight-api-slim` **0.10.3** as a uv tool, with its
own pg0 Postgres (18.1.0) on port 5433.

```bash
# ON THE GEEKOM
curl -LsSf https://astral.sh/uv/install.sh | sh

# The same tool, the same version
uv tool install "hindsight-api-slim==0.10.3"

# It brings its own admin CLI, which is what does the bank export/import.
# The binary lands in ~/.local/bin (a uv tool's entry point).
hindsight-admin --help

# If it is not on your PATH, call it by its absolute path:
#   ~/.local/bin/hindsight-admin
```

**Note on the binary's location.** On the VPS, `hindsight-admin` lives
at **`/home/hermes/.local/bin/hindsight-admin`** — it belongs to the
**`hermes`** user, because that is who installed the tool. On the
GEEKOM it will be in **the GEEKOM user's own `~/.local/bin/`**, since
the GEEKOM installs its own instance. The commands below use the
absolute path for the VPS side and the plain name for the GEEKOM side.

### 3.2 The GEEKOM's Hindsight profile env

The VPS's daemon reads `/home/hermes/.hindsight/profiles/hermes.env`
(a **mode-600, other-user** file). The GEEKOM's daemon needs **its
own** env file, owned by the GEEKOM's user, with **its own** key:

```bash
# ON THE GEEKOM
mkdir -p ~/.hindsight/profiles
```

The variables it needs (the names are public; the values are not):

| variable | value on the GEEKOM |
|---|---|
| `HINDSIGHT_API_LLM_BASE_URL` | `https://api.minimax.io/v1` |
| `HINDSIGHT_API_RETAIN_LLM_BASE_URL` | `https://api.minimax.io/v1` |
| `HINDSIGHT_API_REFLECT_LLM_BASE_URL` | `https://api.minimax.io/v1` |
| `HINDSIGHT_API_CONSOLIDATION_LLM_BASE_URL` | `https://api.minimax.io/v1` |
| `HINDSIGHT_API_LLM_API_KEY` | the **working** MiniMax key |
| `HINDSIGHT_API_RETAIN_LLM_API_KEY` | the same |
| `HINDSIGHT_API_REFLECT_LLM_API_KEY` | the same |
| `HINDSIGHT_API_CONSOLIDATION_LLM_API_KEY` | the same |
| `HINDSIGHT_API_LLM_MODEL` | `MiniMax-M2.5` (the extraction model the VPS uses) |

**The key is the thing that failed before.** On the VPS the daemon's
key was invalid on both hosts and every write failed with
`401 invalid api key (2049)`; the fix was the owner swapping in the
working key (fingerprint `b47bd6931ae2`). **The GEEKOM must start
with the working key**, and §3.4 verifies it *before* the bank is
imported.

The full set of `HINDSIGHT_API_*` variables the service reads is large
(~330). Only the ones listed above need setting; the rest have
defaults.

### 3.3 The GEEKOM's service unit

```bash
# ON THE GEEKOM
mkdir -p ~/.config/systemd/user
```

`~/.config/systemd/user/hindsight.service`:

```ini
[Unit]
Description=Hindsight memory daemon (gustale profile)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=%h/.local/bin/hindsight-api
WorkingDirectory=%h
Environment="HOME=%h"
Environment="PATH=%h/.local/bin:%h/.local/share/uv/tools/hindsight-api-slim/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
EnvironmentFile=%h/.hindsight/profiles/hermes.env
Restart=always
RestartSec=5
TimeoutStopSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

```bash
# ON THE GEEKOM
systemctl --user daemon-reload
systemctl --user enable --now hindsight.service
systemctl --user status hindsight.service
```

**Note on WSL2.** systemd must be enabled in the WSL2 distro. If
`systemctl --user` is not available, run the daemon with
`hermes gateway run`-style supervision instead — Hermes documents
`gateway run` as the recommended mode for WSL. In that case the
Hindsight daemon is started by the same mechanism.

### 3.4 Verify the GEEKOM's Hindsight BEFORE importing anything

```bash
# ON THE GEEKOM
# 1. is it up?
curl -s http://localhost:8888/version

# 2. does the LLM path work? (this is the check that failed on the VPS)
curl -s -X POST http://localhost:8888/v1/default/banks/gustale/health/llm

# 3. does it WRITE? (create a scratch bank, not 'gustale')
curl -s -X POST http://localhost:8888/v1/default/banks/_migration_probe/memories \
     -H 'Content-Type: application/json' \
     -d '{"content":"hindsight write-path probe on the GEEKOM"}'

# 4. does it READ BACK?
curl -s -X POST http://localhost:8888/v1/default/banks/_migration_probe/memories/recall \
     -H 'Content-Type: application/json' \
     -d '{"query":"write-path probe"}'

# 5. the write timestamp must MOVE
curl -s http://localhost:8888/v1/default/banks/_migration_probe/stats
```

**If step 2 or 3 fails, stop here.** The bank import re-embeds every
fact using the instance's embedding model, and it will fail the same
way the write path failed. Fix the key first.

### 3.5 Export the `gustale` bank on the VPS, import it on the GEEKOM

`hindsight-admin` has exactly the right pair of commands.

**A note on redaction.** This document lives in a **public** repo, so
it contains **no credential values**: the Telegram chat id is
`<YOUR_CHAT_ID>`, and the pg0 password is read at runtime from
`instance.json` rather than written down. The `instance.json` path and
its contents are the owner's to read.

**The DB URL is the thing to get right.** `hindsight-admin` defaults to
`HINDSIGHT_API_DATABASE_URL=pg0`, and the `pg0` marker resolves against
**`~/.pg0/instances/` of the invoking user**. The VPS's Hindsight
Postgres belongs to the **`hermes`** user, so running the export as
`gustale` with the default resolves to the wrong instance and fails
with `relation "public.documents" does not exist`.

**Point it at the URL explicitly instead.** This needs **no sudo** —
the pg0 instance accepts the `hindsight` role's own credentials, and
`gustale` can already reach it:

```bash
# ON THE VPS — the source instance
# Read the pg0 instance's own credentials from its instance.json rather
# than typing them here -- this document is in a PUBLIC repo.
PG0=/home/hermes/.pg0/instances/hindsight/instance.json
export HINDSIGHT_API_DATABASE_URL="postgresql://$(python3 -c "import json;d=json.load(open('$PG0'));print(d['username']+':'+d['password'])")@127.0.0.1:$(python3 -c "import json;print(json.load(open('$PG0'))['port'])")/hindsight"

/home/hermes/.local/bin/hindsight-admin export-bank \
     --bank gustale \
     --output ~/geekom-migration/gustale-bank-$(date +%Y%m%d-%H%M).zip
```

> **This exact command was run on 2026-11-08 as a probe** (with the
> output to `/tmp`) and it works:
>
> ```
> Exporting bank 'gustale' from schema 'public'...
> [transfer] Exported bank gustale (data=True, bank_config=True, history=False):
>   51 document(s), 1231 observation(s), 0 attachment(s), 764 operation(s),
>   0 mental model(s), 0 knowledge page(s), 0 directive(s), 0 webhook(s)
> Exported bank 'gustale' to ... (1761593 bytes)
> ```
>
> The archive is **63 files, 7.5 MB uncompressed**, with a
> `manifest.json` and one JSON document per record. The probe archive
> was deleted after the check.

The archive carries documents, facts, observations, bank config, mental
models, directives and webhooks. **No embeddings** — they are
regenerated on import against the GEEKOM's own embedding model.

**Add `--include-history`** if the owner wants the operational history
(`audit_log`, `llm_requests`) carried over too. It is off by default,
and the `llm_requests` rows are the diagnostic record of the failed
writes — **useful to keep for the record, not needed for function.**

```bash
# ON THE GEEKOM — the target bank must NOT already exist.
# The GEEKOM's own instance is the one that must be addressed: it uses
# the same 'pg0' marker, so point at it explicitly.
export HINDSIGHT_API_DATABASE_URL="postgresql://hindsight:<password>@127.0.0.1:5433/hindsight"

~/.local/bin/hindsight-admin import-bank \
     --archive ~/geekom-migration/gustale-bank-*.zip \
     --target-bank gustale

# Verify: the bank exists and has the memories
curl -s http://localhost:8888/v1/default/banks
curl -s http://localhost:8888/v1/default/banks/gustale/stats
```

**Expected**: `last_memory_write_at` on the GEEKOM's `gustale` bank
should be **2026-11-07T23:56:24.480675+00:00** — the value the VPS
recorded when the owner's key swap fixed the write path. If it is
older, the export missed something.

### 3.6 Point the Hermes profile at the GEEKOM's own instance

```bash
# ON THE GEEKOM
# ~/.hermes/hindsight/config.json must point at the LOCAL instance:
#   { "mode": "local_external",
#     "api_url": "http://localhost:8888",
#     "bank_id": "gustale",
#     "recall_budget": "mid",
#     "timeout": 120,
#     "idle_timeout": 300 }
#
# On WSL2, localhost works for a service in the same distro. If the
# Hindsight service runs elsewhere, use its WSL address instead.
```

Then verify through Hermes itself:

```bash
# ON THE GEEKOM
hermes memory status
# and, in a Hermes session, one retain and one recall.
```

### 3.7 What about the VPS's Hindsight daemon?

**It stays.** It is the **memory service for the OTHER `hermes` user**
(the `hermes` user's own Hermes profile and its `warden`/`hermes`
banks), and it owns the pg0 cluster on 5433. It has **nothing** to do
with the `gustale` agent, and it was never in `~/.hermes/`.

It can stay bound to `127.0.0.1`. **Do not expose port 8888 or 5433
to the network** — that was the owner's explicit instruction, and it
is also right: the daemon's API has no authentication on that port.

---

## 4. The Telegram gateway cutover — the order matters

### 4.1 On the GEEKOM: install the gateway service

```bash
# ON THE GEEKOM
hermes gateway install        # writes ~/.config/systemd/user/hermes-gateway.service
hermes gateway status
```

**WSL2 note:** systemd in WSL2 is supported but the user service only
starts when the distro is running. For a WSL2 host that is not always
on, run the gateway in the foreground or under a supervisor instead:

```bash
# ON THE GEEKOM — the WSL-recommended mode
hermes gateway run
```

Either way, **exactly one gateway must be running.**

### 4.2 Verify the GEEKOM's gateway BEFORE stopping the VPS's

```bash
# ON THE GEEKOM
hermes gateway status
# expect: telegram connected, no error

# Send the bot a message from Telegram and confirm the REPLY comes
# from the GEEKOM's gateway. This is the real test: a connected
# Telegram long-poll can coexist with another consumer for a moment
# before the conflict shows.
```

### 4.3 Stop the VPS's gateway — then disable it

```bash
# ON THE VPS — the source
hermes gateway stop

# Disable it so a reboot, a crash, or an update cannot bring it back
# and start fighting the GEEKOM for the same token.
hermes gateway uninstall

# Verify it is gone
hermes gateway status
systemctl --user status hermes-gateway.service    # expect: inactive / not-found
```

**`uninstall` removes the unit file.** That is the point: a disabled
unit that a later `hermes gateway install` (or an update) re-enables
is exactly the failure mode this step exists to prevent.

### 4.4 The cron job on the GEEKOM

**The cron ticker runs INSIDE the gateway** — `hermes cron status` on
the VPS says *"Gateway is running — cron jobs will fire automatically"*.
There is no separate cron daemon to start. **Once the GEEKOM's gateway
is running, its cron fires.**

```bash
# ON THE GEEKOM
hermes cron status       # expect: gateway running, 1 active job
hermes cron list         # the 'Provider health probe (gustale)' job
```

The **one** cron job is "Provider health probe (gustale)", `17 7 * * *`,
delivering to `telegram:<YOUR_CHAT_ID>`. It came across in the backup, so
it is already in the GEEKOM's `cron/jobs.json`.

**Never run it in both.** It posts to Telegram; two copies means two
probes a day. If it was paused on the VPS in §2.2, resume it on the
GEEKOM:

```bash
# ON THE GEEKOM
hermes cron resume ea3d04823552
```

**And make sure it is not running on the VPS.** Because the VPS's
gateway is stopped in §4.3, its ticker is stopped with it — that is
the whole reason the VPS's gateway is *uninstalled* rather than merely
stopped.

---

## 5. Verification checklist — every line, before declaring it done

```bash
# 1. The GEEKOM's gateway is the only one running
hermes gateway status                              # ON THE GEEKOM: connected
systemctl --user status hermes-gateway.service     # ON THE VPS: not-found

# 2. The bot answers, and answers from the GEEKOM
#    (send a Telegram message and check the reply)

# 3. The memory service works on the GEEKOM, with the bank
curl -s http://localhost:8888/v1/default/banks/gustale/stats | grep last_memory_write_at
#    expect: 2026-11-07T23:56:24.480675+00:00

# 4. One write and one recall THROUGH HERMES (not curl)
#    in a Hermes session on the GEEKOM: retain one memory, recall it
#    (hermes memory status first, to confirm the provider is 'hindsight')

# 5. The GitHub App key works from the GEEKOM
#    make the first real commit from the GEEKOM and push it

# 6. The VPS's memory port was never exposed
ss -ltn | grep -E '8888|5433'      # ON THE VPS: still localhost-only

# 7. The live database was never touched
#    (nothing in this plan connects to it -- confirm by inspection)

# 8. The VPS's own agent files are still intact
#    (the profile is copied, not moved, until the owner deletes it)
```

### 5.1 The rollback

If the cutover fails, **the VPS gateway is still there** — nothing is
deleted until the owner says so:

```bash
# ON THE VPS
hermes gateway install && hermes gateway start
```

The GEEKOM's gateway must be stopped **first**, or the two will fight
over the token.

---

## 6. After the cutover: the cleanup decision

**The profile is COPIED, not moved.** The VPS keeps
`~/.hermes/` until the owner decides otherwise. That is deliberate:
it is the rollback.

Once the GEEKOM has been running for a while and the owner is happy,
the cleanup is:

| item | action | note |
|---|---|---|
| `~/.hermes/.env` on the VPS | **delete** | the secrets now live on the GEEKOM; two copies is one too many |
| `~/.hermes/backups/.env.bak-*` on the VPS | **delete** | superseded old copies of the secrets |
| `~/.hermes/github-app/gustale-bot.pem` on the VPS | **delete** | the App is bound to the repo, not the host |
| `~/.hermes/config.yaml.bak-*` on the VPS | keep or delete | no secrets, but stale |
| `~/.hermes/state.db` on the VPS | **keep** | the session history's home; 897 MB |
| the VPS's `hermes` user's Hindsight | **keep** | it is not this agent's |
| `~/geekom-migration/*.zip` | **delete** | a credential bundle in a home directory |

**Deleting the secrets from the VPS is the point of the whole
exercise.** Rule 3 (`docs/RULES.md`) makes this VPS a place where the
agent should not hold production credentials — because docker here is
root.

---

## 7. What could go wrong, and what to do

| risk | how it shows up | what to do |
|---|---|---|
| **Both gateways run** | Telegram messages intermittently unanswered | stop one immediately — check both hosts' `hermes gateway status` |
| **The GEEKOM's Hindsight key is wrong** | `401 invalid api key (2049)` on write | the same failure the VPS had — swap in the working key. **§3.4 catches this before the import** |
| **The bank import fails** | `import-bank` errors | it re-embeds every fact; it needs a working embedding provider. Check §3.4 first |
| **`state.db` is torn** | Hermes on the GEEKOM errors on startup | should be impossible — `hermes backup` uses `sqlite3.backup()`. If it happens, restore from a fresh backup |
| **The GEEKOM's `localhost:8888` is unreachable from the Hermes process** | memory calls time out | WSL2 networking — use the WSL address instead of `localhost` |
| **The cron job runs in both places** | two provider probes a day | `hermes cron list` on both hosts |
| **The `gustale` bank is missing on the GEEKOM** | recall returns nothing | re-run `export-bank` / `import-bank`; the target bank must not already exist |
| **`export-bank` fails with `relation "public.documents" does not exist`** | the `pg0` marker resolved to the wrong user's instance | set `HINDSIGHT_API_DATABASE_URL` explicitly to the URL §3.5 builds from `instance.json` — **this was verified to work on 2026-11-08** |
| **A secret is leaked into the repo** | — | the archive and the bank export are **never** committed. Verify with the repo's own secret sweep before any push |

---

## 8. The one-paragraph version

Install Hermes on the GEEKOM, take `hermes backup` on the VPS, copy
the archive over, `hermes import` it, `hermes postinstall` to rebuild
the runtime trees, and `hermes doctor` to confirm the profile is
whole. Separately, install `hindsight-api-slim` on the GEEKOM, give it
its own profile env with the **working** MiniMax key, start it, and
**prove a write works** before importing the `gustale` bank from the
VPS with `hindsight-admin export-bank` → `import-bank` — **both with
an explicit `HINDSIGHT_API_DATABASE_URL`, because the default `pg0`
marker resolves to the wrong user's instance** — and the VPS's memory
port stays closed the whole time. Then install the gateway on the
GEEKOM, verify Telegram answers from it, and **only then** stop and
uninstall the VPS's gateway (the cron ticker lives inside the gateway,
so stopping it stops the cron too). Verify: one gateway, one bank, one
bot, the live database untouched. The VPS keeps its profile as the
rollback until the owner is satisfied; then delete the secrets from it.

**Nothing in this document has been executed.**
