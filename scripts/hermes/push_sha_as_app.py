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
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import jwt
from cryptography.hazmat.primitives import serialization

APP_ID = "5596451"
INSTALL_ID = "178310866"
KEY_PATH = Path(
    os.environ.get("GUSTALE_APP_KEY_PATH")
    or "/home/alex/.hermes/github-app/gustale-bot.pem"
)
REPO = "consciousclarity/gustale.com"


def _app_jwt() -> str:
    with KEY_PATH.open("rb") as fh:
        key = serialization.load_pem_private_key(fh.read(), password=None)
    now = int(time.time())
    return jwt.encode(
        {"iat": now - 60, "exp": now + 540, "iss": APP_ID}, key, algorithm="RS256"
    )


def _installation_token() -> str:
    out = subprocess.run(
        [
            "curl", "-sS", "-X", "POST",
            "-H", f"Authorization: Bearer {_app_jwt()}",
            "-H", "Accept: application/vnd.github+json",
            "-H", "X-GitHub-Api-Version: 2022-11-28",
            "-H", "Content-Type: application/json",
            "-d", json.dumps({"repositories": ["gustale.com"]}),
            f"https://api.github.com/app/installations/{INSTALL_ID}/access_tokens",
        ],
        capture_output=True, text=True, check=True,
    )
    payload = json.loads(out.stdout)
    if "token" not in payload:
        raise SystemExit(f"could not mint an installation token: {payload}")
    return payload["token"]


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

    token = _installation_token()
    url = f"https://x-access-token:{token}@github.com/{REPO}.git"
    push = subprocess.run(
        ["git", "push", url, f"{sha}:refs/heads/{branch}"],
        capture_output=True, text=True,
    )
    # Scrub the token from anything we print.
    out = (push.stdout or "") + (push.stderr or "")
    out = out.replace(token, "***").replace(url, "***")
    sys.stdout.write(out)
    if push.returncode != 0:
        print("::error::push failed")
        return push.returncode

    print(f"pushed {sha} -> {remote}/{branch}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
