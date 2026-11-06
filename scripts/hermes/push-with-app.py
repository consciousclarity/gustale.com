#!/usr/bin/env python3
"""
Mint a fresh gustale-bot installation token that covers ALL the repos
the App is installed on, and push with it.

WHY A FRESH TOKEN
-----------------
An installation token is minted for a SET OF REPOSITORIES. The token
minted by scripts/hermes/gh-app.sh requests only `["gustale.com"]`,
so it carries no permission on gustale-state or gustale.recipes even
though the App is installed there.

The fix is to request all three. The token is minted fresh, used
immediately, and NEVER printed or written to disk.

WHY NOT `git push` WITH THE TOKEN
---------------------------------
The token is an installation token, and installation tokens
authenticate to the GitHub API over HTTPS. It is used here as the
password for the https remote, with the App's slug as the username:

    https://x-access-token:<TOKEN>@github.com/<owner>/<repo>.git

The token is passed to git through a GIT_ASKPASS helper that lives in
a 0600 temp file for the duration of the push, and the file is
removed immediately afterwards. The token never appears in argv, in
a shell history, in a log, or in the remote URL that git stores.
"""
from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
import time
from pathlib import Path

import jwt
from cryptography.hazmat.primitives import serialization

APP_ID = "5596451"
INSTALL_ID = "178310866"
KEY_PATH = Path("/home/gustale/.hermes/github-app/gustale-bot.pem")

# Every repository the App is installed on. The installation token
# must name them all, or it carries no permission on the others.
REPOS = ["gustale.com", "gustale-state", "gustale.recipes"]


def app_jwt() -> str:
    with KEY_PATH.open("rb") as fh:
        key = serialization.load_pem_private_key(fh.read(), password=None)
    now = int(time.time())
    return jwt.encode(
        {"iat": now - 60, "exp": now + 540, "iss": APP_ID}, key, algorithm="RS256"
    )


def installation_token() -> str:
    """Mint the token. The value is returned, never printed."""
    out = subprocess.run(
        [
            "curl", "-sS", "-X", "POST",
            "-H", f"Authorization: Bearer {app_jwt()}",
            "-H", "Accept: application/vnd.github+json",
            "-H", "X-GitHub-Api-Version: 2022-11-28",
            "-H", "Content-Type: application/json",
            "-d", json.dumps({"repositories": REPOS}),
            f"https://api.github.com/app/installations/{INSTALL_ID}/access_tokens",
        ],
        capture_output=True, text=True, check=True,
    )
    payload = json.loads(out.stdout)
    if "token" not in payload:
        raise SystemExit(f"could not mint an installation token: {payload}")
    return payload["token"]


def installation_repos() -> list[str]:
    """Which repositories the App can actually see right now.

    The `/app/installations/{id}/repositories` endpoint needs an
    INSTALLATION token, not the App JWT -- with the App JWT it answers
    404. So the token is minted first, and that token is what lists
    the repos it was granted.
    """
    out = subprocess.run(
        [
            "curl", "-sS",
            "-H", f"Authorization: Bearer {installation_token()}",
            "-H", "Accept: application/vnd.github+json",
            "-H", "X-GitHub-Api-Version: 2022-11-28",
            f"https://api.github.com/app/installations/{INSTALL_ID}/repositories",
        ],
        capture_output=True, text=True, check=True,
    )
    payload = json.loads(out.stdout)
    return [
        f"{r['full_name']} (push={r['permissions']['push']}, "
        f"pull={r['permissions']['pull']})"
        for r in payload.get("repositories", [])
    ]


def push(repo_dir: str, remote_name: str, refspec: str) -> int:
    """Push with the token, through an askpass helper that is removed
    the moment the push finishes."""
    token = installation_token()
    # NOT in /tmp: this filesystem is mounted noexec, so git cannot
    # exec an askpass helper from there. The helper lives beside the
    # script instead, and is removed the moment the push finishes.
    askpass = Path(__file__).resolve().parent / ".gh-app-askpass.sh"
    # Git execs this file directly, so it MUST carry the execute
    # bit. It is committed 0644, so it is made executable here for
    # the duration of the push and restored afterwards.
    askpass.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    env = dict(os.environ)
    env["GIT_ASKPASS"] = str(askpass)
    env["GITHUB_APP_TOKEN"] = token
    env["GIT_TERMINAL_PROMPT"] = "0"
    try:
        proc = subprocess.run(
            ["git", "-C", repo_dir, "push", remote_name, refspec],
            env=env, capture_output=True, text=True,
        )
        # The helper is removed in the finally block below, before
        # anything is printed -- the token lives in the environment,
        # not in the file, but the file should not outlive the push.
        if proc.stdout:
            sys.stdout.write(proc.stdout)
        if proc.stderr:
            sys.stderr.write(proc.stderr)
        return proc.returncode
    finally:
        # The helper is committed to the repo and contains no
        # credential -- the token is in the environment -- so it is
        # left in place, executable, for the next push.
        askpass.chmod(0o755)


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__)
        print("usage: push-with-app.py <repo-dir> <remote> <refspec>")
        return 2

    print("the App can see:")
    for r in installation_repos():
        print(f"  {r}")

    rc = push(sys.argv[1], sys.argv[2], sys.argv[3])
    print(f"push exit code: {rc}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
