#!/usr/bin/env python3
"""Push a VERIFIED sha to a branch as the gustale-bot App. Fast-forward only.

Recreated 2026-11-11 (the previous /tmp copy was lost when tmp was cleared).

USAGE
-----
    python3 push_sha_as_app.py <remote> <branch> <sha> <expected-remote-sha>

RULES ENFORCED HERE
-------------------
* Rule 2: NEVER force-push. Not even --force-with-lease. The push is
  fast-forward-only; if the remote has commits we do not have, it fails.
* The sha pushed is an EXPLICIT argument, never HEAD.
* The token is never printed, never written to a file, never logged.

THE TOKEN
---------
Minted by the ONE shared mint, `scripts/hermes/gh_app_auth.py`. It used to
be minted HERE with `{"repositories": ["gustale.com"]}`, which meant this
script could never push to `gustale-state` -- an installation token
carries NO permission on a repository it does not name.

The token reaches git through a GIT_ASKPASS helper, so it never appears in
argv, in a shell history, in a log, or in the remote URL git stores. (A
token embedded in the URL works too, but then it lands in the process
table and in any error message that echoes the remote.)
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gh_app_auth import installation_token, push_with_token, scrub  # noqa: E402


def git(*args: str, capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args],
        capture_output=capture,
        text=True,
    )


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print(__doc__)
        return 2

    remote, branch, sha, expected_remote_sha = argv

    # 1. The sha must exist locally and be a commit.
    check = git("cat-file", "-t", sha)
    if check.returncode != 0 or check.stdout.strip() != "commit":
        print(f"::error::{sha} is not a local commit")
        return 1

    # 2. The remote's current head must be exactly what the caller expects.
    ls = git("ls-remote", remote, f"refs/heads/{branch}")
    actual_remote_sha = ""
    for line in ls.stdout.splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[1] == f"refs/heads/{branch}":
            actual_remote_sha = parts[0]
    if expected_remote_sha == "(none)":
        if actual_remote_sha:
            print(f"::error::branch exists at {actual_remote_sha}, expected it to be new")
            return 1
    elif actual_remote_sha != expected_remote_sha:
        print(
            "::error::remote moved: expected "
            f"{expected_remote_sha}, found {actual_remote_sha}. "
            "Fetch, reconcile, and re-run. NEVER overwrite."
        )
        return 1

    # 3. The push must be a fast-forward: the remote sha must be an
    #    ancestor of the sha we are pushing. Never force.
    if actual_remote_sha:
        anc = git("merge-base", "--is-ancestor", actual_remote_sha, sha)
        if anc.returncode != 0:
            print(
                "::error::not a fast-forward: "
                f"{actual_remote_sha} is not an ancestor of {sha}. "
                "This would be a rewrite. Aborting."
            )
            return 1

    token = installation_token()
    push = push_with_token(
        token,
        repo_dir=".",
        remote=remote,
        refspec=f"{sha}:refs/heads/{branch}",
    )
    # Scrub the token from anything we print.
    out = scrub((push.stdout or "") + (push.stderr or ""), token)
    sys.stdout.write(out)
    if push.returncode != 0:
        print("::error::push failed")
        return push.returncode

    print(f"pushed {sha} -> {remote}/{branch}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
