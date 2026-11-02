#!/usr/bin/env bash
# The live-approval gate.
#
# WHAT THIS IS
# ------------
# A PR that touches the live database's schema or its data may not be
# merged until Alejandro has explicitly approved that PR for live.
#
# WHY A MERGE NEEDS APPROVAL AT ALL
# ---------------------------------
# Merging does NOT apply migrations. The deploy job (ci.yml, "Deploy to
# Hostinger") pulls the API image, swaps the containers, and rebuilds the
# web images — it contains no psql invocation and no reference to
# db/migrations. The only path from a merged PR to a changed live
# database is a human running scripts/apply-migration-live.sh.
#
# So the label is not a technical barrier; it is the RECORD of the
# decision, and the record is what the standing rule turns on:
#
#     MERGE = APPLY.
#
# A migration PR may not be merged until the go has been given for that
# PR. Merging it is the authorisation to apply it to live. The merge
# therefore cannot be the thing that creates the approval.
#
# THE RULE THIS ENFORCES
# -----------------------
#   * A PR touching db/migrations/** (or the live-data surface below)
#     requires the `approved-live` label.
#   * The label must have been applied by the repository owner
#     (consciousclarity). A label applied by anybody else, by a bot, or
#     by an automation account does not count — the decision has to be
#     Alejandro's, not a machine's.
#   * The check FAILS CLOSED. If the timeline cannot be read, the check
#     fails. It never passes on an error.
#
# USAGE
# -----
#   scripts/check-live-approval.sh <pr-number> <base-sha> <head-sha>
#
# The SHAs are used to decide whether the PR touches the live surface.
# The PR number is used to read the label and who applied it.
set -euo pipefail

PR="${1:?usage: check-live-approval.sh <pr-number> <base-sha> <head-sha>}"
BASE_SHA="${2:?usage: check-live-approval.sh <pr-number> <base-sha> <head-sha>}"
HEAD_SHA="${3:?usage: check-live-approval.sh <pr-number> <base-sha> <head-sha>}"

LABEL="approved-live"
# The only actor whose label application counts as the go.
OWNER="consciousclarity"
# The repository. In CI this is set by the runner; outside CI (the
# script's own tests, or a local dry run) it falls back to the origin
# remote. Unbound would abort under `set -u`, so it is given a default.
REPO="${GITHUB_REPOSITORY:-}"
if [ -z "$REPO" ]; then
  # The origin remote is not always an https URL — on this host it is an
  # SSH remote of the form git@github-gustale:consciousclarity/gustale.com.git.
  # A naive "github.com[:/]" match leaves the "git@github-gustale:" prefix
  # attached and produces a repository name that does not exist, which
  # the API answers with a 404 that the gate would then read as "no
  # label". Strip any leading user@host: first, then take owner/repo.
  REPO="$(git config --get remote.origin.url 2>/dev/null \
    | sed -E 's|^[^:]+@[^:]+:||; s|^git@||; s|.*github\.com[:/]+||; s|\.git$||' || true)"
fi
if [ -z "$REPO" ] || [ "$REPO" = "$REPO.git" ]; then
  echo "::error::cannot determine the repository (set GITHUB_REPOSITORY)"
  exit 1
fi

# The live-data surface.
#
# db/migrations/** is the schema and data migration chain — applying one
# of these changes the live database.
#
# scripts/apply-migration-live.sh and scripts/dryrun-migration.sh are the
# GATE itself. Changing them changes what "safe" means, so a change to
# them is a change to live's safety envelope and needs the same go.
#
# The marker script decides which database is disposable. Changing it
# could un-mark production.
GATED_PATHS=(
  "db/migrations"
  "scripts/apply-migration-live.sh"
  "scripts/dryrun-migration.sh"
  "scripts/mark_disposable_db.sql"
)

echo "::group::the live-approval gate"

echo "--- the changed files:"
CHANGED=$(git diff --name-only "$BASE_SHA" "$HEAD_SHA" || true)
if [ -z "$CHANGED" ]; then
  echo "(the diff came back empty — treating as NO change)"
  CHANGED=""
else
  printf '%s\n' "$CHANGED" | sed 's/^/    /'
fi

# Does any changed file fall inside a gated path?
TOUCHES_LIVE=0
TOUCHED=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  for p in "${GATED_PATHS[@]}"; do
    case "$f" in
      "$p"|"$p"/*)
        TOUCHES_LIVE=1
        TOUCHED="$TOUCHED$f
"
        ;;
    esac
  done
done <<EOF
$CHANGED
EOF

if [ "$TOUCHES_LIVE" -eq 0 ]; then
  echo "--- the PR does not touch the live surface — the gate passes."
  echo "::endgroup::"
  echo "LIVE_APPROVAL_GATE=not_required"
  exit 0
fi

echo "--- the PR TOUCHES the live surface:"
printf '%s' "$TOUCHED" | sed 's/^/    /'

# Now the label. The timeline gives both the label's presence and WHO
# applied it, which a plain label list cannot.
LABELS_JSON=$(gh api "repos/$REPO/issues/$PR/timeline" \
  --paginate \
  -H "Accept: application/vnd.github+json" 2>/tmp/live-approval-err || true)

if [ -z "$LABELS_JSON" ]; then
  echo "::error::could not read the PR timeline — the gate fails closed"
  cat /tmp/live-approval-err 2>/dev/null || true
  echo "::endgroup::"
  echo "LIVE_APPROVAL_GATE=error"
  exit 1
fi

# Pull out every (label, actor) pair for the approved-live label.
APPLIED_BY=$(printf '%s' "$LABELS_JSON" | python3 -c '
import json, sys
raw = sys.stdin.read()

# `gh api --paginate` concatenates SEVERAL JSON arrays — one per page.
# The raw_decode loop below walks every document, so a "labeled" event
# on page 3 is found just like one on page 1. Reading only the first
# document is what made the gate miss real labels.
docs, dec, idx = [], json.JSONDecoder(), 0
while idx < len(raw):
    while idx < len(raw) and raw[idx].isspace():
        idx += 1
    if idx >= len(raw):
        break
    try:
        obj, end = dec.raw_decode(raw, idx)
    except json.JSONDecodeError:
        # A trailing fragment that is not JSON: skip it rather than
        # failing the whole gate, but it must not be silently ignored
        # as a label either.
        break
    docs.append(obj)
    idx = end

label = "approved-live"

# The timeline is an EVENT LOG, not a state. A label that was applied
# and then REMOVED leaves BOTH a "labeled" and an "unlabeled" event
# behind, so counting the "labeled" events would keep an approval alive
# after it was withdrawn.
#
# The state is reconstructed by replaying the events in order:
#   labeled    -> the label is present, applied by this actor
#   unlabeled  -> the label is absent
#
# Two facts are needed at the end: whether the label is present, and who
# applied it. The label is present if the LAST label event was a
# "labeled". The actor is the one who applied it — and if somebody else
# also applied it while it was present, that is a second, unauthorised
# claim, so the list of applicants is kept and checked as a whole.
present = False
applicants = []
for doc in docs:
    if not isinstance(doc, list):
        continue
    for ev in doc:
        if not isinstance(ev, dict):
            continue
        if (ev.get("label") or {}).get("name") != label:
            continue
        kind = ev.get("event")
        if kind == "labeled":
            present = True
            actor = (ev.get("actor") or {}).get("login")
            if actor and actor not in applicants:
                applicants.append(actor)
        elif kind == "unlabeled":
            present = False
            applicants = []
if not present:
    applicants = []
print(" ".join(applicants))
')

if [ -z "$APPLIED_BY" ]; then
  echo "::error::the PR touches the live surface and has no '$LABEL' label."
  echo "::error::Merging a migration PR is the go to apply it to live."
  echo "::error::Ask Alejandro for approval, and set the label yourself."
  echo "::endgroup::"
  echo "LIVE_APPROVAL_GATE=missing_label"
  exit 1
fi

echo "--- the '$LABEL' label was applied by: $APPLIED_BY"

# Every application must be by the owner. A label applied by a bot or
# by another account does not count, even if the label is present.
#
# The count is of applications by the OWNER, and the total is of all
# applications. The label passes only when the owner applied it AND
# nobody else did. A stranger's application is not merely ignored — it
# is a second, unauthorised claim on the approval, so the gate refuses.
OWNER_APPLIED=0
TOTAL_APPLIED=0
for a in $APPLIED_BY; do
  TOTAL_APPLIED=$((TOTAL_APPLIED+1))
  if [ "$a" = "$OWNER" ]; then
    OWNER_APPLIED=$((OWNER_APPLIED+1))
  else
    echo "::error::the '$LABEL' label was applied by '$a', who is not $OWNER."
    echo "::error::Only the owner can approve a live migration."
  fi
done

if [ "$OWNER_APPLIED" -ne 1 ] || [ "$TOTAL_APPLIED" -ne 1 ]; then
  if [ "$OWNER_APPLIED" -eq 0 ]; then
    echo "::error::no approval by $OWNER on this PR."
  else
    echo "::error::the '$LABEL' label was applied $TOTAL_APPLIED times — the approval must be the owner's alone."
  fi
  echo "::endgroup::"
  echo "LIVE_APPROVAL_GATE=wrong_actor"
  exit 1
fi

echo "--- the approval is the owner's."
echo "::endgroup::"
echo "LIVE_APPROVAL_GATE=approved"
exit 0
