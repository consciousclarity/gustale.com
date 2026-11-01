# The publish binding — how publishing is bound to an identity the caller cannot supply

**Status: PROPOSAL. No code written, no schema changed.**

This follows the review of migration 0041–0045 and the finding that
`statement_set_status()` takes the actor as a parameter.

---

## 1. The question you asked, answered with the code

> How does `statement_set_status()` determine the actor? If the actor is a
> parameter the caller passes, any caller (including you) can pass my id
> once I hold a credential, and the guard is void.

**Your reading is correct. The guard is void as an authorisation
control.** It still works as a *content* gate, but it does not bind the
act to a person.

### The signature

```sql
statement_set_status(
  p_statement_id uuid,
  p_to            verification_state,
  p_actor         text
) RETURNS verification_state
```

The full declaration on live:

| property | value |
|---|---|
| `prosecdef` (SECURITY DEFINER) | **false** |
| `provolatile` | volatile |
| `proacl` (the EXECUTE grant) | **empty** — so the PostgreSQL default applies and **PUBLIC can EXECUTE it** |
| owner | `postgres` |
| effective EXECUTE for `gustale` | **true** |

### Where the actor comes from

**Nowhere but the caller.** The function body does:

```sql
IF p_to IN ('verified','published') THEN
  SELECT pc.credential_role, (pc.verified_at IS NOT NULL)
    INTO v_role, v_credential_verified
    FROM publish_credential pc
   WHERE pc.actor = p_actor;      -- ← the caller's string, compared
```

There is no `session_user`, no `current_user`, no `current_setting`, no
signing, no `pg_has_role` check on the caller. The function asks
*"does a row exist whose `actor` column equals the string I was
handed?"* and answers accordingly.

### Proof, on a disposable copy

I issued a credential to the seeded account on the copy
(`00000000-0000-0000-0000-000000000001`, `publisher`, verified), then
called the function **as the bot**, naming that account:

```
NOTICE:  >>> THE CREDENTIAL CHECK PASSED. The bot was refused only by the EVIDENCE gate.
NOTICE:  >>> the refusal was: the gate for research_pending -> verified is not met ...
```

And with an actor that holds nothing:

```
ERROR:  the verified transition is refused: someone-else-entirely holds no publish
        credential. Only an account with a verified editor credential may verify or
        publish a claim.
```

So the mechanism is: **the caller chooses which credential to present.**
The credential check answers "is this actor a holder?", not "is the
caller this actor?".

### The compounding factor: `EXECUTE` is public

`proacl` is empty, so `PUBLIC` has EXECUTE on the function by
PostgreSQL's default. Every role in the cluster — including every
role that can connect — can call `statement_set_status` with any
`p_actor` string it likes.

### What it does still do

The gate is not empty. It is a **content** gate with a good
implementation:

- `verified` requires the statement to be `under_review` and to have a
  class-sufficient `supports` citation.
- `published` requires `verified` first, plus the published-stage
  gates.
- Every transition is logged in `statement_transition_log`.
- The credential check runs **before** the content gates, so an actor
  without a credential never learns whether a content gate is met. That
  ordering is deliberate and the constraint test asserts the message
  names the credential.

**The gap is identity, not content.** A caller who knows a valid
actor's ID can borrow that actor's credential.

---

## 2. The proposal

### 2a. Point `publish_credential.actor` at Better Auth's `"user"` table

**Change:** `publish_credential.actor` references the Better Auth
`"user".id` — the same table the session comes from — instead of the
legacy editorial `users` table.

**No ID mirroring.** There is one identity, in one table, and it is the
one the session already proves.

**The publish path becomes an authenticated app route:**

```
POST /api/statements/:id/publish
  → request.user  (populated by plugins/auth-context.ts from the session)
  → request.user.id is the ONLY source of p_actor
  → the route calls statement_set_status(id, 'published', request.user.id)
```

The route never accepts an actor in the body, the query string, or a
header. If the body carries one, it is ignored — and the route's
contract test asserts that a body-supplied actor has no effect.

**Three layers, then:**

1. **Session** — the caller is authenticated. Proved by Better Auth's
   signed session cookie, not by anything they type.
2. **Credential** — that session's user ID holds a verified credential.
   Now a genuine lookup, not a string comparison against a
   caller-chosen value.
3. **Role** — the credential's role covers the transition
   (`editor` may verify; `publisher` may publish).

### What this protects against

- **A caller supplying someone else's ID.** The actor is derived from
  the session. There is no input to forge.
- **The bot (or any service role) publishing as you.** The bot would
  have to be logged in *as* you, with your session cookie. It cannot
  mint one from a database write.
- **A credential holder's authority being borrowed.** The credential
  now answers "is the authenticated caller a holder?", which is the
  question you actually meant.
- **Credential enumeration.** `publish_credential` becomes a table of
  real accounts, so its rows stop being bearer tokens.

### What this does NOT protect against

**I have shell access to the host and `postgres` is a superuser.**
That means:

- I can `INSERT INTO "user" (...)` a session row, or mint a session
  cookie directly. Then I *am* you, at the database level, and every
  layer above passes.
- I can `SET ROLE` to anything, or simply `UPDATE` the
  `publish_credential` table to add a role, or flip `verified_at`.
- I can edit the function body. `postgres` owns it.
- I can read your credential rows, the session table, and the cookie
  signing secret.

**This proposal raises the cost of an accidental or
under-privileged bypass. It does not protect against a compromised
host or a hostile superuser.** No in-database design can, because the
superuser can rewrite the database that holds the check. That is a
property of Postgres, not of this schema.

**It is still worth doing**, for one reason: the current design
protects against *nothing* against a caller with EXECUTE, and the new
one protects against every caller who is not logged in as the actor.
That is the difference between "any role can borrow any credential" and
"only the account holder can use its own credential".

### Effort

| step | work | notes |
|---|---|---|
| FK + migration | small | `actor` → `"user".id`, or drop the FK and keep it a lookup (see below) |
| The publish route | small | one route, mirroring `dishes-write.ts` |
| Contract tests | small | "a body-supplied actor has no effect"; "an anonymous caller is refused" |
| Retire `users` for this purpose | medium | it has other consumers — see the note |
| Session minting by a superuser | **not addressed** | out of scope for any in-database design |

**Total: roughly a day.** Not because the code is hard, but because
the `users` table has other readers and each needs checking.

**One deliberate choice:** I would *not* add a foreign key from
`publish_credential.actor` to `"user".id` immediately. A FK makes the
relationship explicit and is the right end state, but it also means
deleting an account fails until its credentials are cleaned up. Start
with the lookup and add the FK when the account-deletion path exists.

### The `users` table's other readers

Worth saying plainly: the legacy editorial `users` table is not only
the credential's home. It also carries `role` for some editorial
workflows. Moving the credential to `"user"` does not retire `users`
on its own — it retires `users` as the **credential** identity. The
two tables can then be reconciled or `users` retired separately.

---

## 2b. Option B — approvals signed by a key that never lives on the server

**This is the option that actually answers "what protects against a
hostile superuser?"** Because the signing key is not on the host, a
superuser cannot forge an approval — they can only replay one.

### The shape

1. You approve a publish on **your device**, using a WebAuthn
   passkey (Touch ID / Windows Hello / a hardware key).
2. The device signs a **canonical payload** — the statement ID, the
   target state, and an expiry — with a key that lives in the device's
   secure element and never leaves it.
3. The server verifies the signature against the **registered public
   key** and checks the payload.
4. The server performs the transition, recording the signature, the
   public key's ID, and the payload in the audit log.

**The public key lives on the server. The private key does not.** A
superuser can delete the public key (blocking you) or add a new one
(granting themselves) — so this alone is not sufficient, and I will
not pretend otherwise.

### What closes that gap

**Publish the key's identity somewhere the superuser cannot reach.**
Options, in increasing strength:

- **A public transparency log** (a signed, append-only log, e.g. a
  Rekor-style log or a Git commit in a repo you control outside this
  host). The server must produce a signed entry; anything it produces
  is checkable against the log. A superuser who adds a rogue key
  produces an entry that does not verify.
- **A counter-signed timestamp** from an external service, so a rogue
  key has a timestamp outside the server's control.
- **Your own device as the only issuer of sessions** — you keep a
  second factor that the server never sees.

### What it protects against

- **A superuser forging an approval.** They cannot sign the payload.
  They can *replay* a past approval — which is why the payload must
  carry an expiry and a nonce, and the transition must be recorded.
- **A stolen database.** The public keys and the audit log are
  useless to an attacker without the private key.
- **The bot, or any service role.** It has no key.

### What it does not protect against

- **A hostile superuser can still edit the transition logic itself.**
  They can change the function to skip the signature check, or
  publish directly with `SET ROLE`. The signature check makes the
  *evidence* of approval non-forgeable; it does not make the *effect*
  unforgeable, because the effect happens in a database the superuser
  controls.
- **A compromised host can still corrupt or delete the audit trail.**
  Hence the external log.
- **Replay**, unless the payload is nonce-bound and the nonce is
  consumed.

**Stated plainly: no design binds an action inside a database against
a superuser of that database.** WebAuthn moves the *authorisation
evidence* outside the host. It does not move the *execution* outside
the host. The two together are as strong as it gets without taking
the publish path off the server entirely.

### Effort

| piece | work | notes |
|---|---|---|
| WebAuthn registration + assertion | **medium** | a library (SimpleWebAuthn) plus a credential table; ~2–3 days |
| Canonical payload + verification | small | sign the statement ID, target, expiry, nonce; ~half a day |
| Nonce consumption + expiry | small | a single-use table; ~half a day |
| Audit log records the signature | small | extend `statement_transition_log` |
| External transparency anchoring | **medium** | depends on where you anchor it; 1–2 days |
| Migration off the current model | small | the credential table becomes "registered keys", not "actors" |
| Passkey UX on the publish surface | small | a button that opens the platform prompt |

**Total: roughly a week.** Plus whatever the external anchoring costs
in ongoing operations.

### Recommendation

**Do 2a now. Do 2b later, and only if you want the authorisation
evidence to survive a host compromise.**

2a is the correctness fix — the current design has an authorisation
hole that does not need a superuser to exploit. 2b is the hardening
layer, and it is genuinely more work for a threat (hostile superuser)
that no in-database design fully answers.

**They compose.** 2a makes the actor come from the session; 2b makes
the *approval* come from your device. Together: an authenticated
session whose credential holds, and a transition signed by a key that
is not on the server.

---

## 3. What I am not doing, and why

- **Not writing the code yet.** You asked for a proposal, and the
  `users` → `"user"` move touches other consumers.
- **Not issuing a credential.** Yours, and on your device.
- **Not registering your account.** You said no registration or
  credential steps until you have decided.
- **Not changing `statement_set_status`'s signature** yet. It is
  `SECURITY DEFINER = false` and needs the bot's SELECT on
  `publish_credential`; a `SECURITY DEFINER` version that derives the
  actor from the session would need a careful ownership and `search_path`
  treatment. It is a candidate for the 2a implementation.

## 4. One adjacent finding

`statement_set_status` has an **empty `proacl`**, so `PUBLIC` has
EXECUTE on it. Every role that can connect can call it. Under 2a the
function becomes reachable only through the route, and I would
`REVOKE EXECUTE ... FROM PUBLIC` and grant it to the route's role
only. That is a small change with a real effect, and it belongs with
2a rather than with it.
