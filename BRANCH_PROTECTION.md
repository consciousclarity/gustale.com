# Branch Protection — `main`

> Once the repo exists on GitHub, apply these rules on `Settings → Branches → Branch protection rules → Add rule`.
> You can also apply them with the GitHub REST API (see "Apply via API" below).

## Required status checks (must pass before merge)

| Job | Workflow | Why |
|---|---|---|
| `lint` | `CI / Lint + typecheck` | Catches type errors and lint regressions before code lands |
| `test` | `CI / Tests (vitest + postgis)` | Validates the API contract end-to-end against a real PostGIS database |
| `build` | `CI / Docker build (gustale-api)` | Proves the Dockerfile builds cleanly on a fresh runner, not just your machine |

## Settings

| Setting | Value | Why |
|---|---|---|
| **Require a pull request before merging** | ✅ | No direct pushes to `main`; every change is reviewed |
| **Required approvals** | `1` | Solo project, but a self-review checkbox in the PR template documents intent |
| **Dismiss stale pull request approvals when new commits are pushed** | ✅ | New commits must be re-reviewed |
| **Require review from Code Owners** | ❌ (until a CODEOWNERS file is added) | Will turn on automatically when you add one |
| **Require status checks to pass before merging** | ✅ | The three jobs above are blocking |
| **Require branches to be up to date before merging** | ✅ | Prevents merging a PR that's behind `main` |
| **Require conversation resolution before merging** | ✅ | All bot/review comments must be addressed |
| **Require signed commits** | ❌ (for now) | Optional; can enable once you have a signing key set up |
| **Require linear history** | ❌ | Squashing is fine; merge commits are fine |
| **Do not allow force pushes** | ✅ | Protected by default; just don't disable it |
| **Do not allow deletions** | ✅ | Cannot accidentally delete `main` |
| **Lock branch** | ❌ | Don't lock it; you should still be able to push hotfixes |
| **Allow auto-merge** | ✅ | Optional; lets Dependabot auto-merge green PRs |
| **Allow fork PRs** | ❌ | Until you publish, reject PRs from forks to avoid token-leak attempts |

## Apply via API (optional, advanced)

Once you have a fine-grained PAT with `Administration: write` for the repo, you can apply all the above in one call:

```bash
# Save your token once
export GH_TOKEN=ghp_xxxxxxxxxxxx

OWNER=<your-github-username>   # e.g. alejandro
REPO=gustale.com

curl -X PUT \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/$OWNER/$REPO/branches/main/protection \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": [
        "CI / Lint + typecheck",
        "CI / Tests (vitest + postgis)",
        "CI / Docker build (gustale-api)"
      ]
    },
    "enforce_admins": true,
    "required_pull_request_reviews": {
      "dismiss_stale_reviews": true,
      "required_approving_review_count": 1,
      "require_code_owner_reviews": false
    },
    "restrictions": null,
    "required_linear_history": false,
    "allow_force_pushes": false,
    "allow_deletions": false,
    "block_creations": false,
    "required_conversation_resolution": true,
    "lock_branch": false,
    "allow_fork_pushes": false,
    "allow_auto_merge": true
  }'
```

The first time you do this, GitHub's API requires the repo to exist (so the repo URL above is real, not a placeholder). After the curl returns 200, verify with:

```bash
curl -H "Authorization: Bearer $GH_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/branches/main/protection | jq
```

## Why these specific checks?

- **`lint` + `test` + `build`** form a triangle: static analysis, runtime behavior, and deployability. A green `test` job with a red `build` job means your code works but your Dockerfile is broken — exactly the kind of thing that bit us when we manually pushed `0.1.0` from the Geekom. CI should catch it.
- **`build` depends on `[lint, test]`** in the workflow — so it only runs after both pass, saving ~3 min of runner time on broken PRs.
- **Nightly is intentionally separate** — it does a clean-slate `DROP SCHEMA public CASCADE` + schema regeneration + reseed + coverage. If nightly goes red, the drift is in the schema, not the code, and you know where to look.

## What this doesn't cover (future work)

- **PR labels** — set up `.github/labeler.yml` so Dependabot PRs auto-label
- **Dependabot** — `.github/dependabot.yml` for weekly pnpm + Docker base-image updates
- **CodeQL** — add the `github/codeql-action` workflow for security scanning on every PR
- **Release workflow** — `release.yml` that tags and builds a versioned image on `v*` tags
- **Deploy workflow** — not added per the A1 decision; do manually for now
