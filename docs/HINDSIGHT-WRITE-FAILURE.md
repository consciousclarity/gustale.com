# Hindsight writes fail with 401 — "invalid api key (2049)"

**Status:** diagnosed, not fixed. The four base-URL overrides still need to be deleted and
the service restarted.

## Symptom

- Hindsight **writes** fail: `HTTP 401/500`, `invalid api key (2049)`, `type: authorized_error`.
- Hindsight **reads and recall** work normally.
- The Hindsight service itself is healthy and reachable on `127.0.0.1:8888`.

## What was proven

The error code identifies the **host**, not the key:

| provider host | malformed key | wrong-but-valid-looking key |
|---|---|---|
| `api.minimaxi.com` | 1004 | **2049** |
| `api.minimax.io` | 1004 | 200 |

- Error `2049` is returned **only** by `api.minimaxi.com`. It never appears from
  `api.minimax.io`.
- A malformed key returns `1004` from **both** hosts.

Therefore: the configured base URL points at `api.minimaxi.com` instead of
`api.minimax.io`, and the key itself is fine. A malformed key would have produced `1004`,
not `2049`.

## The fix

Delete **all four** base-URL overrides and restart the service:

- `HINDSIGHT_API_LLM_BASE_URL`
- `HINDSIGHT_API_RETAIN_LLM_BASE_URL`
- `HINDSIGHT_API_CONSOLIDATION_LLM_BASE_URL`
- `HINDSIGHT_API_REFLECT_LLM_BASE_URL`

Setting them to the correct host explicitly is also acceptable; the point is that all
four must agree, because each of the four call paths failed the same way.

## Obstacle

The env file is mode `0600` owned by `hermes`. Reading it requires `sudo`, and `sudo`
needs a password, so it cannot be read from this session unattended.

## Verification after the fix

1. Perform one Hindsight write and confirm it returns HTTP 200.
2. Read it back with recall.
3. Report `last_memory_write_at` to confirm writes are actually landing.

Until a write succeeds, treat Hindsight as **read-only**: it can supply context but must
not be relied on to retain anything.
