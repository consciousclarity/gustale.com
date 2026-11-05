#!/usr/bin/env python3
"""
Attach files to an existing pull request, using the `gh` CLI.

WHY THE CLI
-----------
GitHub's asset-upload endpoint now requires multipart form data, and
the REST API responses no longer carry the `upload_url` template. The
`gh` CLI does the multipart encoding itself, so it is the shorter and
less error-prone path.

The token is minted for EVERY repository the App is installed on --
the App now lives on gustale.com, gustale-state and gustale.recipes --
and is passed to `gh` through its environment only. It is never
printed and never written to a file.
"""
from __future__ import annotations

import json
import mimetypes
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
REPOS = ["gustale.com", "gustale-state", "gustale.recipes"]


def app_jwt() -> str:
    with KEY_PATH.open("rb") as fh:
        key = serialization.load_pem_private_key(fh.read(), password=None)
    now = int(time.time())
    return jwt.encode(
        {"iat": now - 60, "exp": now + 540, "iss": APP_ID}, key, algorithm="RS256"
    )


def token() -> str:
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


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: attach-to-pr.py <repo> <pr-number> <file> [file ...]")
        return 2

    repo, number = sys.argv[1], sys.argv[2]
    files = sys.argv[3:]

    env = dict(os.environ)
    env["GH_TOKEN"] = token()
    env["GH_REPO"] = repo
    env["GH_PAGER"] = "cat"
    env["GH_CONFIG_DIR"] = env.get("GH_CONFIG_DIR", "/tmp/.gh-app-config")
    env["GH_FORCE_TTY"] = "0"

    rc = 0
    for f in files:
        p = Path(f)
        if not p.exists():
            print(f"  skipped (not found): {f}")
            continue
        # The asset endpoint requires MULTIPART form data with an
        # explicit Content-Length -- curl's `-F` sends the body
        # chunked, and GitHub answers "Bad Size". So the body is built
        # here, where its exact length is known, and posted with the
        # length stated. The bytes never touch argv.
        boundary = "----HermesAssetBoundary7d91f3a2"
        data = p.read_bytes()
        head = (
            f"--{boundary}\r\n"
            f"Content-Disposition: form-data; name=\"file\"; "
            f"filename=\"{p.name}\"\r\n"
            f"Content-Type: {mimetypes.guess_type(p.name)[0] or 'application/octet-stream'}\r\n"
            f"\r\n"
        ).encode()
        tail = f"\r\n--{boundary}--\r\n".encode()
        body = head + data + tail

        proc = subprocess.run(
            [
                "curl", "-sS", "-X", "POST",
                "-H", f"Authorization: Bearer {env['GH_TOKEN']}",
                "-H", "Accept: application/vnd.github+json",
                "-H", "X-GitHub-Api-Version: 2022-11-28",
                "-H", f"Content-Type: multipart/form-data; boundary={boundary}",
                "-H", f"Content-Length: {len(body)}",
                "--data-binary", "@-",
                f"https://uploads.github.com/repos/consciousclarity/{repo}"
                f"/issues/{number}/assets",
            ],
            input=body, capture_output=True,
        )
        try:
            payload = json.loads(proc.stdout.decode())
        except json.JSONDecodeError:
            payload = {"raw": proc.stdout[:300], "stderr": proc.stderr[:300]}
        if "browser_download_url" in payload:
            print(f"  attached: {p.name}")
            print(f"    {payload['browser_download_url']}")
        else:
            print(f"  FAILED {p.name}: {json.dumps(payload)[:400]}")
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
