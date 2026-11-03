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

THE TWO TOKENS
--------------
There are two different tokens, and mixing them up is the usual failure:

  * the **App JWT** -- signed with the private key, `iss` = the App ID.
    It identifies the APP. It can read `/app` and `/app/installations`, and
    it can MINT installation tokens. It cannot act on a repository.

  * the **installation token** -- minted from the App JWT, scoped to the
    installation and the repositories it was granted. It acts ON the
    repository. It expires in 1 hour.

An installation token cannot be minted by hand: it requires the App JWT.
So this helper mints a fresh one each run and never stores it.

THE TOKEN IS NEVER PRINTED
--------------------------
Neither token is ever written to stdout, a log, or a file. `gh` is
invoked with the token in its environment only, and `GH_TOKEN` is set
for the child process alone.

USAGE
-----
    python3 scripts/hermes/gh-app.sh api GET /installation/repositories
    python3 scripts/hermes/gh-app.sh pr list
    python3 scripts/hermes/gh-app.sh pr create "title" "body"
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
KEY_PATH = Path("/home/gustale/.hermes/github-app/gustale-bot.pem")
REPO = "consciousclarity/gustale.com"


def _app_jwt() -> str:
    with KEY_PATH.open("rb") as fh:
        key = serialization.load_pem_private_key(fh.read(), password=None)
    now = int(time.time())
    return jwt.encode(
        {"iat": now - 60, "exp": now + 540, "iss": APP_ID}, key, algorithm="RS256"
    )


def _installation_token() -> str:
    """Mint an installation token. The value is returned, never printed."""
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
        raise SystemExit(f"::error::could not mint an installation token: {payload}")
    return payload["token"]


def _run_gh(args: list[str]) -> int:
    """Run `gh` with the installation token, without ever echoing it."""
    env = dict(os.environ)
    env["GH_TOKEN"] = _installation_token()
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
        if len(argv) < 2:
            print("usage: gh-app.sh api <METHOD> <path> [json-body]")
            return 2
        method = argv[1]
        path = argv[2]
        body = argv[3] if len(argv) > 3 else None
        cmd = [
            "curl", "-sS", "-X", method,
            "-H", f"Authorization: Bearer {_installation_token()}",
            "-H", "Accept: application/vnd.github+json",
            "-H", "X-GitHub-Api-Version: 2022-11-28",
        ]
        if body:
            cmd += ["-H", "Content-Type: application/json", "-d", body]
        cmd.append(f"https://api.github.com{path}")
        proc = subprocess.run(cmd, capture_output=True, text=True)
        # Print the body, but never the token (it is only in the header).
        sys.stdout.write(proc.stdout)
        return proc.returncode

    if mode == "pr":
        return _run_gh(["pr", *argv[1:]])

    if mode == "gh":
        return _run_gh(argv[1:])

    print(f"::error::unknown mode {mode!r}")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
