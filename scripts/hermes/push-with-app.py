#!/usr/bin/env python3
"""Push a branch using the GitHub App's installation token.

The token is minted in-process, put in the environment of the git
child ONLY, and never written to a file, an argument, or stdout.

Usage: push-with-app.py <remote> <refspec>
"""

from __future__ import annotations

import base64
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.request

APP_ID = "5596451"
INSTALL_ID = "178310866"
KEY_PATH = "/home/gustale/.hermes/github-app/gustale-bot.pem"


def mint_installation_token() -> str:
    """Mint an installation token for the App.

    The JWT is built exactly the way scripts/hermes/gh-app.sh builds
    it: the PEM is loaded with `cryptography` (not passed to jwt.encode
    as a string), and the request carries the API version header. A
    hand-rolled JWT gets a 401 -- the App rejects it.
    """
    import jwt
    from cryptography.hazmat.primitives import serialization

    with open(KEY_PATH, "rb") as fh:
        key = serialization.load_pem_private_key(fh.read(), password=None)
    now = int(time.time())
    app_jwt = jwt.encode(
        {"iat": now - 60, "exp": now + 540, "iss": APP_ID}, key, algorithm="RS256"
    )

    req = urllib.request.Request(
        f"https://api.github.com/app/installations/{INSTALL_ID}/access_tokens",
        data=json.dumps({"repositories": ["gustale.com"]}).encode(),
        headers={
            "Authorization": "Bearer " + app_jwt,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "gustale-hermes",
        },
    )
    payload = json.loads(urllib.request.urlopen(req, timeout=30).read())
    return payload["token"]


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: push-with-app.py <remote> <refspec>", file=sys.stderr)
        return 2
    remote, refspec = sys.argv[1], sys.argv[2]

    env = dict(os.environ)
    env["GH_TOKEN"] = mint_installation_token()
    env["GITHUB_TOKEN"] = env["GH_TOKEN"]
    env["GIT_TERMINAL_PROMPT"] = "0"

    proc = subprocess.run(
        ["git", "push", remote, refspec],
        env=env,
        capture_output=True,
        text=True,
    )
    # The output never contains the token, but strip it just in case.
    out = proc.stdout.replace(env["GH_TOKEN"], "[REDACTED]")
    err = proc.stderr.replace(env["GH_TOKEN"], "[REDACTED]")
    if out:
        print(out.rstrip())
    if err:
        print(err.rstrip(), file=sys.stderr)
    print(f"exit: {proc.returncode}")
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
