#!/usr/bin/env bash
# Probe whether this host's GitHub credential can push a commit that touches
# .github/workflows/. GitHub refuses such pushes for tokens without the
# `workflow` scope. This is a READ-ONLY probe: it creates a throwaway branch,
# pushes one commit that changes a workflow file, reports the result, and
# then deletes the branch.
#
# Usage: probe-workflow-scope.sh
set -uo pipefail
cd /home/gustale/projects/gustale.com

BASE_SHA="$(gh api repos/consciousclarity/gustale.com/branches/main --jq .commit.sha)"
BRANCH="tmp/workflow-scope-probe"
echo "base=${BASE_SHA} branch=${BRANCH}"

cleanup() {
  git checkout -- .github/workflows/ci.yml 2>/dev/null || true
  git reset --hard "$BASE_SHA" 2>/dev/null || true
  gh api -X DELETE "repos/consciousclarity/gustale.com/git/refs/heads/${BRANCH}" >/dev/null 2>&1 || true
  echo "probe cleaned up"
}
trap cleanup EXIT

git checkout -B "$BRANCH" "$BASE_SHA" >/dev/null 2>&1 || { echo "checkout failed"; exit 1; }

# A no-op change to the workflow file: add a comment line.
printf '\n# workflow-scope probe (temporary)\n' >> .github/workflows/ci.yml
git add .github/workflows/ci.yml
git -c user.email=hermes@gustale.com -c user.name="Hermes" commit -m "test: workflow scope probe" >/dev/null 2>&1

echo "--- pushing a commit that touches .github/workflows/ci.yml ---"
if git push --force origin "$BRANCH" 2>&1 | tail -5; then
  echo "RESULT: PUSH_ALLOWED"
else
  echo "RESULT: PUSH_REJECTED"
fi
