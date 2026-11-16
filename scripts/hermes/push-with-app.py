#!/usr/bin/env python3
"""
Mint a fresh gustale-bot installation token that covers ALL the repos
the App is installed on, and push with it.

WHY A FRESH TOKEN
-----------------
An installation token is minted for a SET OF REPOSITORIES. A token minted
for `["gustale.com"]` carries NO permission on `gustale-state` or
`gustale.recipes`, even though the App is installed there and even though
the installation grants it. So the repository list is stated explicitly
and the mint response is checked against it.

The token is minted fresh, used immediately, and NEVER printed or written
to disk.

The mint itself lives in `scripts/hermes/gh_app_auth.py` -- the ONE shared
mint -- so there is a single place to fix when the installation changes.

WHY NOT `git push` WITH THE TOKEN IN THE URL
--------------------------------------------
The token is an installation token, and installation tokens authenticate
to GitHub over HTTPS as the password for the https remote, with the App's
slug as the username:

    https://x-access-token:<TOKEN>@github.com/OWNER/REPO.git

That works, but the token then appears in the process table and in any
error message that echoes the remote. So the token is passed to git
through a GIT_ASKPASS helper instead: it never appears in argv, in a
shell history, in a log, or in the remote URL that git stores. The helper
holds no credential -- it reads the token from the environment.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gh_app_auth import (  # noqa: E402
    installation_repositories,
    installation_token,
    push_with_token,
    scrub,
)


def push(repo_dir: str, remote_name: str, refspec: str) -> int:
    """Push with the token, through an askpass helper."""
    token = installation_token()
    proc = push_with_token(token, repo_dir, remote_name, refspec)
    out = scrub((proc.stdout or "") + (proc.stderr or ""), token)
    if out.strip():
        print(out.strip())
    return proc.returncode


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__)
        print("usage: push-with-app.py <repo-dir> <remote> <refspec>")
        return 2

    token = installation_token()
    print("the App can see:")
    for r in installation_repositories(token):
        print(f"  {r['full_name']}")

    rc = push(sys.argv[1], sys.argv[2], sys.argv[3])
    print(f"push exit code: {rc}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
