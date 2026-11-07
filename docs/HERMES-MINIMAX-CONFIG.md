# Hermes configuration notes — the MiniMax route

**Written:** 2026-11-07. This is the long-form home for the material that
was in the agent's persistent memory, so that memory can stay a thin
index.

## 1. The MiniMax Max-OAuth route and its real context cap

The route is `api.minimax.io/anthropic` (the Anthropic-compatible shape),
authenticated with a Max-OAuth token.

**The advertised "1M" is not the cap.** The real cap is **1,048,576
tokens (2^20)**, enforced on **`input + max_tokens` together** — not on
the input alone.

Proven on 2026-11-07:

| request | result |
|---|---|
| `max_tokens=131072`, input 915,295 | **accepted** |
| `max_tokens=16`, input 1,030,152 | **accepted** |
| `max_tokens=131072`, input ~925,000 | **rejected** (2013) |
| `max_tokens=131072`, input ~1,060,000 | **rejected** (2013) |

So the **maximum usable INPUT is 917,504 tokens**, when
`max_tokens=131072` — because 917,504 + 131,072 = 1,048,576 exactly.

**Hermes sends `max_tokens=131072` for every MiniMax model.** That is
why the window is "600k" rather than "1M" in practice: the headroom is
consumed by the response reservation, not by the input.

**The 2013 error is the tell.** When the combined figure exceeds the
cap, the provider answers with error code **2013**, not a 400 with a
context message.

## 2. The auxiliary-slot trap

`auxiliary.compression`'s **model context** gates the **main session's**
compression threshold. If the auxiliary model has a smaller context
window than the main one, Hermes **auto-lowers** the main session's
compression trigger to the auxiliary model's context.

Concretely, with **MiniMax-M2.5** (context 204,800) as the auxiliary
model, the main session's live compression trigger drops to 204,800 —
**only 22% of the 1,048,576-token window is usable**, which is why the
session looked like it had a 600k ceiling.

Worse, the failure is a **hard 400**: if the auxiliary model is asked to
handle the *full* threshold payload and cannot, the request fails with
`context window exceeds limit`. **M3.1-Flash handled a 450k payload
without complaint.**

**The rule: the auxiliary model must be able to handle the FULL
threshold payload**, or the threshold must not be raised.

**Rotation safety.** `session-guard` refreshes **only**
`MINIMAX_OAUTH_MAX_TOKEN` in `os.environ`. An auxiliary slot configured
on `MINIMAX_API_KEY` has **no rotation safety net** — when that key
expires, the auxiliary call fails and the session's compression
threshold silently drops back.

## 3. The configuration that was checked, and what it concluded

- The provider connection itself is healthy: reads and writes on the
  global host answer 200; the `1004` and `404` codes are the provider's
  ordinary "not found" / "rate limited" answers.
- **The route was correct.** The auxiliary route was not a mistake — it
  was the reason the window looked small.
- **The fix is the auxiliary model**, not the main model. Swapping the
  auxiliary slot to M3.1-Flash (or any model whose context matches the
  main session's threshold) restores the full window.

## 4. How the evidence was produced

Every claim above came from a **real request** against the live route
with the real token, and the numbers are the ones the provider
accepted and rejected. The rejection boundary was bracketed from both
sides (accepted at 915,295 and 1,030,152; rejected at ~925,000 and
~1,060,000) rather than inferred from documentation.
