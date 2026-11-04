# ADR-005 — The live-approval gate: merge means apply

- **Status:** accepted (2026-11-02)
- **Supersedes:** nothing. Amends ADR-004 §14 (the publish credential) in
  one respect only: the actor that the credential binds to.
- **Applies to:** every PR in `consciousclarity/gustale.com` that touches
  the live database.

## The decision

**A PR that touches the live database is not merged without Alejandro's
explicit, per-PR go. Merging such a PR IS the go to apply it to live.**

The gate is mechanical: the PR must carry the `approved-live` label, and
the label must have been applied by `consciousclarity`. The CI job
`live-approval` checks this on every pull request.

## Why a merge needs a gate at all

Because the deploy does not migrate, and therefore the merge is the only
moment at which the decision to touch live can be made.

**The deploy job performs no migration.** This is a property of the
workflow, and it was verified by reading it rather than assumed:

- `.github/workflows/ci.yml`, the `deploy` job, contains **no `psql`
  invocation** and **no reference to `db/migrations`** anywhere in its
  script body. Its steps are: log in to ghcr, pull the API image, update
  the build checkout, swap the API container, wait for health, run
  `scripts/hermes/build-web-live.sh`, tag the web images, verify the
  containers, prune.
- `scripts/hermes/build-web-live.sh` likewise contains **no `psql`** and
  **no migration step**. It runs `docker build` for the two web images.
- The API container's `CMD` is `node dist/server.js`. The server's boot
  path registers Fastify routes and nothing else; there is no migration
  runner at startup, and no `migrate()` call anywhere in `apps/api/src`.
- The only workflow that connects to the VPS other than the deploy is
  the Nightly, which runs `scripts/retranslate_stale.py` — a translation
  job, not a migration.

So the *only* path from a merged PR to a changed live database is a
human running `scripts/apply-migration-live.sh` by hand.

**That is why the gate sits on the merge.** If the apply is manual and
unguarded, the rule "do not touch live without the go" is a convention
that a busy agent will eventually break. Making the merge the moment
that requires the label gives the rule a mechanical edge, and it makes
the go and the apply the same act: the merge authorises the apply, and
the apply follows the merge.

## What the gate does NOT do

Stated plainly, because a security decision that overstates itself is
worse than one that admits its limit.

- **It does not stop anyone from running the apply script by hand.**
  The gate is a merge-time check. An operator with shell access to the
  VPS can still apply a migration without opening a PR. The gate
  establishes a record and a workflow; it is not a sandbox.
- **It does not protect the live database from a database-level
  attacker.** Someone with the `postgres` superuser role, or the
  `gustale_credential_issuer` role, can change the schema directly.
  The gate is about *process*, not about *access control*.
- **It does not enforce itself as a hard requirement without the
  repository's branch protection.** The check is a required status
  check *once branch protection lists it*. Until the ruleset is
  configured in the repository settings, GitHub shows the check but
  does not refuse the merge. **This ruleset still has to be set by
  someone with admin rights on the repository** — see "What is left to
  do" below.
- **It does not verify what the migration actually does.** The gate
  reads the DIFF, not the SQL's semantics. A migration that hides a
  data change inside a file under `db/migrations/` is still gated — but
  a change to live data made through some other path (a script run
  outside the repository, an admin tool) is not gated at all.

## Why a label, and why the actor is checked

A label is a weak mechanism, and two things make it stronger:

1. **The label must have been applied by the owner.** The gate reads the
   PR's issue timeline and checks *who* applied the label, not merely
   that the label is present. A label applied by a bot, by a
   dependabot, or by another account does not satisfy it. The decision
   has to be Alejandro's.
2. **The gate fails closed.** If the timeline cannot be read, the gate
   fails. It never passes on an error.

The timeline is an **event log, not a state**. A label that was applied
and then removed leaves both a `labeled` and an `unlabeled` event
behind, so the gate replays the events and honours only the final
state. This was a real bug found by the gate's own tests: an earlier
version counted `labeled` events and kept honouring an approval that had
been withdrawn.

## The live-data surface

The gate requires the label when the PR changes any of:

| Path | Why |
|---|---|
| `db/migrations/**` | Applying one of these changes the live schema or its data. |
| `scripts/apply-migration-live.sh` | This is the live-apply gate. Changing it changes what "safe" means. |
| `scripts/dryrun-migration.sh` | The dry-run half of the gate. |
| `scripts/mark_disposable_db.sql` | The marker decides which database is disposable. Changing it could un-mark production. |

The gate script and the marker are gated because they define the
*envelope* of what a live change can be. A change to the checker that
approves changes is itself a change that needs approval.

## The standing rule, restated

> A PR that contains a migration, or that changes live data, is not
> merged without Alejandro's explicit go for that PR.
>
> **Merge = apply.** The merge is the authorisation. After the merge,
> the migration is applied to live through the standing gate in
> `scripts/apply-migration-live.sh` — backup, snapshot, dry-run on an
> exact copy, count assertions, apply, independent verification.

The standing gate for the apply itself is unchanged and still applies:
a live change goes through backup → snapshot → dry-run on an exact copy
→ count assertions → apply → independent verification, with automatic
rollback on failure. This ADR adds the *decision* gate in front of it.

## The gate must run from the base branch (amended 2026-11-02)

The gate originally ran on `pull_request`. That made it
**self-defeating**: `pull_request` checks out the PR's own code, and
the gate script lives in the repository. A PR that touched
`db/migrations/` could edit `scripts/check-live-approval.sh` in the same
diff, and CI would run **the PR's weakened gate against the PR**. The
check that decides whether a migration may be merged was, in that case,
written by the thing it was checking.

The gate now runs on **`pull_request_target`**, which executes the
workflow from the **base branch**:

- the checkout is pinned to `github.event.pull_request.base.sha`, so the
  PR's code is never present in the job;
- the gate script that runs is the base branch's copy;
- the job does **not** check out the PR's head and does **not** execute
  anything from the PR.

Because `pull_request_target` carries a powerful token, the change is
deliberately narrow: **only** the `live-approval` job runs on that
event. The `lint`, `test`, `build` and `build-web` jobs are all
guarded with `if: github.event_name != 'pull_request_target'`, so no
PR's code ever runs under the privileged token.

`scripts/test-base-branch-approval-gate.sh` asserts this structure
(9 checks) and fails if the gate is moved back onto `pull_request`,
if the checkout is pointed at the PR head, if any other job is allowed
to run on `pull_request_target`, or if the gate's permissions grow.

## What the gate does NOT do

It does not check *who is asking* for the gate to run, and it is not a
substitute for branch protection. See "What is left to do" below.

## What is left to do

- **Set the branch protection / ruleset so the `live-approval` check is
  required.** The check runs and reports, but GitHub will not refuse the
  merge until the repository settings require it. The token available on
  this host cannot write branch protection or rulesets (HTTP 403:
  "Resource not accessible by personal access token"), so this needs
  either a repository admin or a token with the `administration` scope.
  Until then the gate is advisory in the merge UI, though the workflow
  still fails the check and the agent's own process treats a failing
  check as a block.

- **Separate the approving identity from the acting identity.** See
  "The identity problem" below.

## The identity problem, and what a GitHub App can and cannot do

**The problem.** The gate requires the `approved-live` label to have been
applied by `consciousclarity` exactly. The agent's own PAT on this host
*is* `consciousclarity`. So the agent can approve its own PR, and the
"only Alejandro can approve" rule is not a boundary — it is a habit.

**The correction to the original proposal.** The proposal said a GitHub
App would be granted a "Labels" permission. **There is no Labels
permission in GitHub.** Label mutation is not a separate scope: it is
part of **Pull requests: write** (`pull-requests: write`), the same
scope that lets the App edit a PR's title or body. Any identity that
can write to a pull request can therefore set or remove `approved-live`.

**What this means for the trust boundary.** The App must NOT be trusted
to *not* label. The boundary has to come from elsewhere:

1. **The gate checks the effective label actor, exactly.** The App may
   apply the label; the gate still requires the actor to be
   `consciousclarity`. The App's own applications of the label do not
   count and must be rejected by the gate.
2. **Branch protection requires the `live-approval` check.** A required
   status check is what actually blocks the merge, and it is set in the
   repository settings, which the App is not given permission to change.
3. **The App gets no `Workflows` and no `Administration` permission.**
   Without `workflows`, the App cannot write to `.github/workflows/`
   and cannot trigger a workflow run. Without `administration`, it
   cannot touch branch protection, rulesets or repository settings.

**The App's permissions, exactly:**

| permission | value | why |
|---|---|---|
| `Metadata` | read-only | required; always granted |
| `Contents` | read-only | reads the base branch's gate script |
| `Pull requests` | read & write | **includes label mutation** — there is no separate Labels permission |
| `Workflows` | **none** | so the App cannot edit workflows or trigger runs |
| `Administration` | **none** | so the App cannot weaken branch protection |

**The gate runs from the base branch** (see above), so even a PR that
changes the App's configuration cannot change the rule that judges it.

**The remaining gap, stated plainly.** While the agent's PAT acts as
`consciousclarity`, the agent *can* self-approve. Moving the label to
an App does not close that by itself: the App is only useful once the
agent's own PAT can no longer act as `consciousclarity`. The sequence is
therefore: Alejandro sets up the App → Alejandro confirms the App works
→ the `consciousclarity` PAT is deleted from the VPS → only then does
the App's identity become the only one that can label, and the gate's
exact-actor check becomes a real boundary.

Until that last step happens, this remains a **procedural** boundary:
the agent's own process does not add or remove `approved-live`, and
every approval is recorded in the PR timeline with its actor.

## The amendment to ADR-004 §14

ADR-004 §14 defined the publish credential's actor as a row in the
legacy editorial `users` table, and `statement_set_status()` took the
actor as a **caller-supplied argument**.

Two changes, both decided on 2026-11-02:

1. `publish_credential.actor` will reference Better Auth's `"user"`
   table directly. The legacy `users` table is disconnected from
   authentication and is not an identity source.
2. `statement_set_status()` will **not** take the actor as an argument.
   It will derive the publisher itself.

**What this protects against.** A caller who can reach the database
cannot assert a different actor. The function asks "is the caller the
publisher?" rather than "does a credential exist whose actor equals the
string I was handed?". That closes the impersonation path proven on a
disposable copy: naming another actor passed the credential check and
failed only at a later evidence gate.

**What this does NOT protect against — stated plainly:**

- **A shared database role.** If the API and the migration scripts share
  a role, anyone who can `SET ROLE` to it can act as that role. The
  function's authority is the role's authority.
- **Host shell access.** Anyone with a shell on the VPS as a user that
  can reach the database socket can call the function directly, as
  whatever role they can reach. No function-level check can distinguish
  "the API called this" from "a person called this".
- **A database superuser.** `postgres` can read and change everything,
  including the credential rows and the function's own definition.
- **A compromised application host.** If the machine running the API is
  compromised, the attacker inherits the API's database session.

The honest statement is this: **the change binds the actor to an
authenticated session, which protects against API-level substitution and
confused-deputy bugs. It does not protect against anyone who already
holds the database role or the host.** Option B — a client-held key,
passkey or WebAuthn approval — reduces the server-side blast radius
because the approving device is not the server. It does not protect
against physical access to an unlocked device either. Option B remains a
recorded future option; it is not implemented.
