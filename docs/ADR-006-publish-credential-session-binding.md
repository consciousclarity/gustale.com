# ADR-006 — Binding the publish credential to the Better Auth session

- **Status:** proposed (2026-11-02) — awaiting Alejandro's go
- **Decides:** GUS-1021, Option A with the stated condition
- **Depends on:** ADR-004 §14 (the publish credential)
- **Supersedes:** the caller-supplied actor of `statement_set_status()`

## The problem, stated exactly

`statement_set_status()` decides whether a claim may be verified or
published by asking a question whose answer the caller supplies:

```sql
statement_set_status(p_statement_id uuid, p_to verification_state, p_actor text)
```

The authorisation check inside it is:

```sql
SELECT pc.credential_role, (pc.verified_at IS NOT NULL)
  INTO v_role, v_credential_verified
  FROM publish_credential pc
 WHERE pc.actor = p_actor;
```

`p_actor` is a text argument. The function does not read the session, does
not read `session.user_id`, does not read `current_user`, and does not
read any request-scoped setting. It compares a string the caller chose
with a string stored in a table.

That is not a theoretical weakness. It was proved on a disposable copy of
the live database: a test credential was issued to the seeded account, and
the function was then invoked as the `gustale` role while naming that
account in `p_actor`. The credential check **passed** — the function
believed the caller held a verified publisher credential. The call failed
later, at the evidence gate, and only by accident.

Two separate defects sit on top of each other here.

**The first is that the actor is caller-supplied.** Any code path that
can reach the function can choose whose identity it claims to be. The
check `pc.actor = p_actor` asks "does the named actor hold a
credential?", not "does the caller hold a credential?". Those are
different questions, and only the second one is an authorisation check.

**The second is that `publish_credential.actor` is free text with no
foreign key.** It does not reference the Better Auth `"user"` table. The
guard added in ADR-004 §14 checks the *editorial* `users` table, which
is a different table from the one the login system uses — and the one
live `"user"` accounts actually have an id in. So today a real Better
Auth login cannot receive a publisher credential at all, and the actor
string in the credential table is a freehand value that nothing
constrains.

## The decision

Option A, with the condition Alejandro stated: bind the credential to
the Better Auth `"user"`, **and** remove the actor argument from
`statement_set_status()` so the function derives the publisher itself.

Two changes, and they are one change.

### Change one: the credential names a real login

`publish_credential.actor` becomes a foreign key to `"user"(id)`.
No mirroring. No legacy `users` table. No text that means "whoever I
think this is". The credential says which **login** may publish, and the
login is the same identity the rest of the application already
authenticates.

This also fixes the ADR-004 §14 guard, which was written against the
wrong table: the credential's actor must be an id that exists in
`"user"`, because that is where the application's identities live.

### Change two: the function derives the publisher, and says who it is

The actor argument goes away. The function takes the session token it is
given, validates it against the `session` table, reads the `user_id`
from that session row, and uses **that** as the actor:

```sql
statement_set_status(p_statement_id uuid, p_to verification_state)
```

The actor is now derived from a session token the caller must possess.
Possessing the token is what authenticates the caller; the function
derives the identity from it rather than accepting it.

A caller who passes someone else's id cannot, because there is no id
parameter to pass. A caller who passes another user's session token
acts as that user, because that is what a stolen session token means —
and a stolen session token is a compromise of that account, not a flaw
in this function. The distinction matters: the previous design let a
caller *assert* an identity it did not hold; this one lets a caller only
*use* an identity it holds.

The `session` table is the authority, because it is the same table
Better Auth reads. The function validates the token directly rather than
trusting a caller-supplied id, and it applies the same expiry rule
Better Auth applies (`expires_at > now()`).

## What this protects against

- **Caller-supplied actor substitution.** The original defect. A caller
  can no longer name an actor it does not hold a credential for. The
  check becomes "does the session's user hold a credential?" — a real
  authorisation check rather than a string comparison against a value the
  caller chose.
- **The wrong-table guard.** A credential can no longer name an identity
  that does not exist in the login system. The foreign key makes it
  structurally impossible, rather than relying on a guard that checked
  the wrong table.
- **A credential for a person who has no account.** The foreign key
  makes the credential unusable by a non-existent account.
- **The confused-deputy case.** A route that forwards a request cannot
  cause the function to act as someone else, because the function
  ignores whatever the route says about who is calling.
- **Session expiry.** A revoked or expired session fails the check, so a
  stale session cannot publish.

## What this does NOT protect against — stated plainly

**A shared database role.** The `gustale` role is a single role shared
by the API and the bot. Anyone who can `SET ROLE gustale` and reach
`postgres` can call `statement_set_status()` directly. They still need a
valid session token for a user who holds a credential — so this is not a
free pass — but the database does not, and cannot, distinguish "the API
calling on a user's behalf" from "a human with psql calling on a user's
behalf". If that distinction matters, it needs per-caller database
credentials, which is a different design (Option C, not proposed here).

**Host shell access.** Anyone with root or shell on the host has the
database and can read the `session` table, mint a session row, or modify
`publish_credential` directly. No function-level design survives that,
because the attacker does not have to go through the function. This is
the boundary of what the database can enforce, and it is not a boundary
this ADR moves.

**A stolen session token.** A token is a bearer credential. Whoever holds
it can act as that user for the token's life. The design reduces the
value of a stolen token to exactly the stolen user's privileges — it does
not make it worthless. Session expiry bounds the window (seven days by
the current configuration; `updateAge` refreshes it daily). The
`cookieCache` (five minutes) does not affect this check, because the
check reads the `session` table directly.

**A compromise of the application process.** If the API process is
compromised, the attacker inherits the application's ability to publish.
The credential still requires a session belonging to a user who holds
one, so the attacker must also have a session for such a user — but the
process is where those requests are minted.

**The wrong actor inside a legitimate session.** If a legitimate
publisher's session is used to publish something they should not, the
function cannot tell. It is an authorisation check on identity and
role, not on the content of the claim.

## Option B, recorded as a future option

**A client-held key, or a passkey / WebAuthn approval.** The publisher
holds a key; the approval is performed by a device the server cannot
read, so a compromise of the server alone cannot authorise a publish.

This is strictly stronger than Option A against server compromise and
host shell access: it moves the root of trust off the server. It costs
more to build, needs a per-publisher enrolment and recovery story, and
introduces a second factor that can be lost. It is recorded here as the
recorded future option it is, and it is not implemented now.

## The comparison

| | Option A (this ADR) | Option B (future) |
|---|---|---|
| Caller-supplied actor | impossible | impossible |
| Server compromise | attacker needs a session of a publisher | attacker needs a session **and** the publisher's device |
| Host shell access | attacker can read the session table | attacker can read the session table; still needs the device |
| Shared DB role | not distinguished | not distinguished |
| Build cost | small | large |
| Recovery story | ordinary (re-issue credential) | harder (re-enrol the device) |

## What this does not change

- The evidence gates. The `verified` and `published` content rules are
  untouched by this migration. The gates read `claim_citations` and
  `sources`, and they are exactly as they were.
- The trigger revocation of 0042. That migration closed the bot's
  `TRIGGER` privilege; this ADR closes the actor substitution. They are
  different defects and both stay closed.
- The `PUBLIC EXECUTE` default on the function. That remains, and it is
  worth noting: `EXECUTE` is granted to `PUBLIC` by default in
  PostgreSQL, so any role can *call* the function. The function's own
  checks are what refuse the call. This ADR makes those checks sound;
  it does not narrow who may call.
- The editorial `users` table. It stays as it is — disconnected from
  login, and not an identity source.

## The migration

`db/migrations/0047_publish_credential_session_binding.sql`.

It will:

1. Add the session-derived function,
   `statement_set_status(p_statement_id, p_to)`, which reads the
   session token and derives the actor itself.
2. Make the old four-argument form fail loudly rather than remain
   callable, so no code path keeps using the caller-supplied actor.
3. Add the foreign key from `publish_credential.actor` to `"user"(id)`,
   after checking that the table is empty (it is: zero rows on live) so
   no row needs back-filling.
4. Restrict `EXECUTE` on the function to the roles that need it.
5. Carry the regression test that proves the old shape no longer works
   and the new one does.

The migration is written and dry-run on an exact copy of live before
anything is applied. Applying it to live needs Alejandro's explicit go,
and the `approved-live` label on the PR that carries it, per ADR-005.

## The app-side change that goes with it

The function's new shape needs a session token, so the call site must
have one. The API already resolves the session on every request —
`auth.getSession(request)` in `apps/api/src/plugins/auth-context.ts` —
and `request.user` is that session's user.

So the publish route will:

1. Require a moderator (`app.requireRole(request, "moderator")`), which
   already 401s an anonymous request and 403s an insufficient role.
2. Read the session token from the request cookie.
3. Call `statement_set_status(p_statement_id, p_to)` with the token.

The route never passes an actor id. It cannot: the function has no such
parameter.

No application route calls `statement_set_status()` today. This is the
first caller, and it is written to the new shape from the start.

## The ADR-004 §14 guard, restated

The guard in 0038 that checks the editorial `users` table becomes the
foreign key to `"user"`. A credential may only name a login that exists
in the application's identity system. The legacy mirroring of ids
between `users` and `"user"` is not introduced, and the legacy table is
not consulted.

## What is explicitly NOT done here

- No publisher credential is registered. `publish_credential` is empty
  on live and stays empty until Alejandro says otherwise.
- No session row is minted for any user.
- No role is granted to any account.
- No `statement_set_status()` call site is added to a public route
  until the route's own tests exist. The migration and the ADR land
  first; the route lands with it, behind the same approval.
