#!/usr/bin/env python3
"""Run a GitHub API call as the gustale-bot App, using an installation token.

WHY THIS EXISTS
---------------
The personal access token (PAT) is to be revoked. Everything the agent does
on GitHub from then on must authenticate as the App instead.

The App has NO `administration` permission and NO `workflows` permission, by
design:

    GET /app -> {"actions":"read","checks":"read","contents":"write",
                 "issues":"read","metadata":"read","pull_requests":"write",
                 "statuses":"read"}

So this helper cannot administer the repo, cannot push to a workflow
workflow, and cannot change branch protection. That is the point.

THE TOKEN
---------
The token is minted by `scripts/hermes/gh_app_auth.py` -- the ONE shared
mint -- and it covers EVERY repository the App is installed on
(`gustale.com`, `gustale-state`, `gustale.recipes`). It used to be minted
here with `{"repositories": ["gustale.com"]}` only, which meant this
helper could never see `gustale-state`: an installation token carries NO
permission on a repository it does not name.

THE TOKEN IS NEVER PRINTED
--------------------------
The token is never written to stdout, a log, or a file. `gh` is
invoked with the token in its environment only, and `GH_TOKEN` is set
for the child process alone.

USAGE
-----
    python3 scripts/hermes/gh-app.sh api GET /installation/repositories
    python3 scripts/hermes/gh-app.sh api GET /repos/OWNER/REPO/actions/runs/ID/logs
    python3 scripts/hermes/gh-app.sh pr list
    python3 scripts/hermes/gh-app.sh pr create "title" "body"
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gh_app_auth import (  # noqa: E402
    REPOS,
    api as _api,
    api_bytes as _api_bytes,
    installation_repositories,
    installation_token,
    scrub,
)

# The default repository for the `gh` modes.
APP_ID = "5596451"
INSTALL_ID = "178310866"
# The key lives under the USER's home, not a fixed account's. The VPS
# account is "gustale"; the local WSL account is "alex". A hardcoded
# path made the helper fail with FileNotFoundError on this box, which
# reads like "the App is broken" when the App is fine.
_KEY_CANDIDATES = (
    Path.home() / ".hermes" / "github-app" / "gustale-bot.pem",
    Path("/home/gustale/.hermes/github-app/gustale-bot.pem"),
)


def _key_path() -> Path:
    for candidate in _KEY_CANDIDATES:
        if candidate.exists():
            return candidate
    return _KEY_CANDIDATES[0]


KEY_PATH = _key_path()
REPO = "consciousclarity/gustale.com"


def _run_gh(args: list[str]) -> int:
    """Run `gh` with the installation token, without ever echoing it."""
    env = dict(os.environ)
    env["GH_TOKEN"] = installation_token()
    env["GH_REPO"] = REPO
    env["GH_PAGER"] = "cat"
    # `gh` must not fall back to a stored credential.
    env["GH_CONFIG_DIR"] = env.get("GH_CONFIG_DIR", "/tmp/.gh-app-config")
    proc = subprocess.run(["gh", *args], env=env, capture_output=True, text=True)
    if proc.stdout:
        sys.stdout.write(proc.stdout)
    if proc.stderr:
        sys.stderr.write(proc.stderr)
    return proc.returncode


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2

    mode = argv[0]

    if mode == "api":
        if len(argv) < 3:
            print("usage: gh-app.sh api <METHOD> <path> [json-body]")
            return 2
        method, path = argv[1], argv[2]
        body = argv[3] if len(argv) > 3 else None
        token = installation_token()
        payload = _api(token, method, path, body)
        if isinstance(payload, str):
            print(payload)
        else:
            print(json.dumps(payload, indent=2))
        return 0

    if mode == "api-raw":
        # For endpoints that answer with BINARY -- the Actions logs return
        # a ZIP. `follow` makes curl follow the 302 to the signed
        # blob-storage URL; WITHOUT it the body is 0 bytes, which is what
        # made the CI logs look empty for weeks.
        if len(argv) < 3:
            print("usage: gh-app.sh api-raw <METHOD> <path> [out-file]")
            return 2
        method, path = argv[1], argv[2]
        out_file = argv[3] if len(argv) > 3 else None
        token = installation_token()
        data, status = _api_bytes(token, path, follow_redirects=True)
        if out_file:
            Path(out_file).write_bytes(data)
            print(f"HTTP {status}  {len(data)} bytes -> {out_file}")
        else:
            sys.stdout.buffer.write(data)
        return 0 if status == 200 else 1

    if mode == "repos":
        token = installation_token()
        for r in installation_repositories(token):
            print(f"  {r['full_name']:<44} private={r['private']}")
        return 0

    if mode == "pr":
        return _run_gh(["pr", *argv[1:]])

    if mode == "gh":
        return _run_gh(argv[1:])

    print(f"::error::unknown mode {mode!r}")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
