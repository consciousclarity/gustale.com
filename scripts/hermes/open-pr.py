#!/usr/bin/env python3
"""
Open a pull request as the gustale-bot App.

WHY NOT scripts/hermes/gh-app.sh
--------------------------------
That helper mints an installation token for `["gustale.com"]` only and
hardcodes GH_REPO to gustale.com. It is fine for what it does, but a
pull request needs a token that can also read the branch it is
comparing, and it needs to attach files.

This helper:
  * mints an installation token covering every repository the App is
    installed on;
  * creates the PR through the GitHub REST API (so the file uploads
    can use the same token);
  * uploads the before/after screenshots as PR attachments, so the
    evidence travels with the review.

The token is never printed and never written to disk.
"""
from __future__ import annotations

import json
import mimetypes
import subprocess
import sys
import time
from pathlib import Path

import jwt
from cryptography.hazmat.primitives import serialization

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
REPOS = ["gustale.com", "gustale-state", "gustale.recipes"]
OWNER = "consciousclarity"
API = "https://api.github.com"


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
            f"{API}/app/installations/{INSTALL_ID}/access_tokens",
        ],
        capture_output=True, text=True, check=True,
    )
    payload = json.loads(out.stdout)
    if "token" not in payload:
        raise SystemExit(f"could not mint an installation token: {payload}")
    return payload["token"]


def api(tok: str, method: str, path: str, body=None, raw=None,
        content_type: str | None = None):
    cmd = [
        "curl", "-sS", "-X", method,
        "-H", f"Authorization: Bearer {tok}",
        "-H", "Accept: application/vnd.github+json",
        "-H", "X-GitHub-Api-Version: 2022-11-28",
    ]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    if raw is not None:
        cmd += ["-H", f"Content-Type: {content_type}", "--data-binary", f"@{raw}"]
    cmd.append(f"{API}{path}")
    out = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        return {"raw": out.stdout, "stderr": out.stderr}


def existing_open_pr(tok: str, repo: str, head: str):
    """Return the html_url of an already-open PR for this head, or None.

    GitHub's create-PR endpoint does NOT refuse a duplicate: a re-run
    of this helper against a branch that already has an open PR opens
    PR #2 for the same head. So the check happens BEFORE the create.

    It is a GET, so it is safe to run against any repo the App is on.
    """
    owner = repo.split("/")[0] if "/" in repo else OWNER
    name = repo.split("/")[-1]
    cmd = [
        "curl", "-sS", "-X", "GET",
        "-H", f"Authorization: Bearer {tok}",
        "-H", "Accept: application/vnd.github+json",
        "-H", "X-GitHub-Api-Version: 2022-11-28",
        "-w", "\n%{http_code}",
        f"{API}/repos/{owner}/{name}/pulls?head={owner}:{head}&state=open",
    ]
    out = subprocess.run(cmd, capture_output=True, text=True)
    parts = out.stdout.rsplit("\n", 1)
    if len(parts) != 2 or parts[1].strip() != "200":
        return None
    try:
        payload = json.loads(parts[0])
    except json.JSONDecodeError:
        return None
    if isinstance(payload, list) and payload:
        return payload[0].get("html_url")
    return None


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__)
        print("usage: open-pr.py <repo> <head-branch> <title> <body-file> "
              "[--base <branch>] [image ...]")
        return 2

    repo, head, title, body_file = sys.argv[1:5]
    images = sys.argv[5:]

    # An optional base branch, for a STACKED PR.
    #
    # A PR that builds on another PR must have that PR's branch as its
    # base, or the diff shows the whole stack instead of this PR's
    # own work. The base is given as the last argument that is not an
    # image path, after "--base".
    base = "main"
    rest: list[str] = []
    i = 0
    while i < len(images):
        if images[i] == "--base" and i + 1 < len(images):
            base = images[i + 1]
            i += 2
            continue
        rest.append(images[i])
        i += 1
    images = rest

    tok = token()

    # A re-run must NOT open a SECOND PR for the same branch.
    already = existing_open_pr(tok, repo, head)
    if already:
        print(f"  a PR for {head} already exists: {already}")
        return 0

    body = Path(body_file).read_text()

    result = api(
        tok, "POST", f"/repos/{OWNER}/{repo}/pulls",
        body={
            "title": title,
            "body": body,
            "head": head,
            "base": base,
            "maintainer_can_modify": True,
        },
    )
    if "number" not in result:
        print("could not create the PR:")
        print(json.dumps(result, indent=2)[:2000])
        return 1

    number = result["number"]
    url = result["html_url"]
    print(f"PR #{number}: {url}")

    # ── the screenshots ──────────────────────────────────────────────
    if images:
        # The upload URL is a TEMPLATE:
        #   {owner}/{repo}/issues/{number}/assets
        # and the create response does not carry it -- it is read from
        # the PR object itself, fetched fresh.
        pr = api(tok, "GET", f"/repos/{OWNER}/{repo}/pulls/{number}")
        tmpl = pr.get("upload_url", "")
        if not tmpl:
            print("  could not read the upload URL; skipping the images")
            images = []
        upload_url = tmpl.split("{")[0]
        for img in images:
            p = Path(img)
            if not p.exists():
                print(f"  skipped (not found): {img}")
                continue
            ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
            out = api(
                tok, "POST", upload_url,
                raw=str(p), content_type=ctype,
            )
            if "browser_download_url" in out:
                print(f"  attached: {p.name} -> {out['browser_download_url']}")
            else:
                print(f"  FAILED to attach {p.name}: "
                      f"{json.dumps(out)[:300]}")

    print(f"\n{number}\t{url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
