#!/usr/bin/env python3
"""ONE place to mint a gustale-bot installation token.

WHY THIS MODULE EXISTS
-----------------------
Five scripts used to mint their own installation token, each with its own
copy of the JWT code, its own private-key lookup, and its own repository
list. They disagreed:

    gh-app.sh            ["gustale.com"]
    push_sha_as_app.py   ["gustale.com"]
    push-with-app.py     ["gustale.com", "gustale-state", "gustale.recipes"]
    open-pr.py           ["gustale.com", "gustale-state", "gustale.recipes"]
    attach-to-pr.py      ["gustale.com", "gustale-state", "gustale.recipes"]

An installation token is scoped to the repositories it names. A token
minted for `["gustale.com"]` therefore carries NO permission on
`gustale-state`, even though the App is installed there and even though
the installation grants it. That is why `gustale-state` was unreachable:
the token could not have reached it, and `GET /installation/repositories`
answered with exactly one repository.

The two key-path conventions were also a trap: three scripts looked under
`/home/gustale/.hermes/...` (the VPS account) and two looked under
`Path.home()` (the local WSL account, `alex`). A hardcoded path made the
helper raise `FileNotFoundError` on this box, which reads like "the App
is broken" when the App is fine.

One module, one repository list, one key lookup. Every script imports it.

THE TOKEN IS NEVER PRINTED
--------------------------
No function here prints, logs, writes, or returns a token into any string
that could be printed. `push_with_token()` keeps it in the child's
ENVIRONMENT only, and `scrub()` removes it from anything that gets
printed.

TWO TOKENS, DON'T MIX THEM UP
------------------------------
  * the **App JWT** -- signed with the private key, `iss` = the App ID.
    It identifies the APP. It can read `/app` and `/app/installations`,
    and it can MINT installation tokens. It cannot act on a repository.

  * the **installation token** -- minted from the App JWT, scoped to the
    installation and the repositories it was granted. It acts ON the
    repository. It expires in 1 hour.
"""
from __future__ import annotations

import json
import os
import stat
import subprocess
import time
from pathlib import Path

import jwt
from cryptography.hazmat.primitives import serialization

APP_ID = "5596451"
INSTALL_ID = "178310866"
API = "https://api.github.com"
OWNER = "consciousclarity"

# EVERY repository the App is installed on and that we need to act on.
#
# The list must name every repo the caller will touch. A token that omits
# a repo carries NO permission on it -- not "read-only", NO permission.
#
# All three were verified present and granted on 2026-11-16:
#
#   GET /installation/repositories  -> total_count 3
#     consciousclarity/gustale.com        (public)
#     consciousclarity/gustale-state      (private)
#     consciousclarity/gustale.recipes    (private)
#
# An installation token minted with NO "repositories" field also works and
# carries the whole installation -- but its mint response lists
# `repositories: []`, which reads like a failure and is easy to
# misdiagnose. So the list is stated EXPLICITLY and the mint response is
# checked against it.
REPOS = ["gustale.com", "gustale-state", "gustale.recipes"]

# The private key lives under the USER's home, not a fixed account's. The
# VPS account is "gustale"; the local WSL account is "alex". A hardcoded
# path made the helper fail with FileNotFoundError on this box.
_KEY_CANDIDATES = (
    Path(os.environ.get("GUSTALE_APP_KEY_PATH", "") or "/nonexistent"),
    Path.home() / ".hermes" / "github-app" / "gustale-bot.pem",
    Path("/home/gustale/.hermes/github-app/gustale-bot.pem"),
)


def key_path() -> Path:
    """The first private key that actually exists."""
    for candidate in _KEY_CANDIDATES:
        if candidate and candidate.exists():
            return candidate
    raise SystemExit(
        "::error::the App private key was not found. Looked at: "
        + ", ".join(str(c) for c in _KEY_CANDIDATES)
    )


KEY_PATH = key_path()


def app_jwt() -> str:
    """The App JWT. It can MINT tokens; it cannot act on a repository."""
    with KEY_PATH.open("rb") as fh:
        key = serialization.load_pem_private_key(fh.read(), password=None)
    now = int(time.time())
    return jwt.encode(
        {"iat": now - 60, "exp": now + 540, "iss": APP_ID},
        key,  # type: ignore[arg-type]
        algorithm="RS256",
    )


def installation_token(repos: list[str] | None = None) -> str:
    """Mint an installation token covering `repos` (default: REPOS).

    The value is RETURNED, never printed. Callers must scrub it from
    anything they print.
    """
    wanted = list(repos if repos is not None else REPOS)
    out = subprocess.run(
        [
            "curl", "-sS", "-X", "POST",
            "-H", "Authorization: Bearer " + app_jwt(),
            "-H", "Accept: application/vnd.github+json",
            "-H", "X-GitHub-Api-Version: 2022-11-28",
            "-H", "Content-Type: application/json",
            "-d", json.dumps({"repositories": wanted}),
            f"{API}/app/installations/{INSTALL_ID}/access_tokens",
        ],
        capture_output=True, text=True, check=True,
    )
    try:
        payload = json.loads(out.stdout)
    except json.JSONDecodeError:
        raise SystemExit(
            f"::error::could not mint an installation token (not JSON): "
            f"{out.stdout[:300]}"
        )
    if "token" not in payload:
        # GitHub answers 422 with a message naming the offending repo.
        raise SystemExit(
            "::error::could not mint an installation token: "
            + json.dumps({k: v for k, v in payload.items() if k != "token"})[:600]
        )

    # Prove the token really covers what we asked for. GitHub returns
    # 422 if ANY requested repo is not in the installation, so a 200 here
    # already proves the list is valid -- but an empty list would be a
    # silent scope reduction, so it is checked.
    granted = [r["full_name"].split("/", 1)[-1] for r in payload.get("repositories", [])]
    missing = [r for r in wanted if r not in granted]
    if missing:
        raise SystemExit(
            "::error::the installation token does not cover "
            f"{missing}. The installation grants: {granted}. "
            "Fix the repository list, or the installation."
        )
    return payload["token"]


def scrub(text: str, token: str) -> str:
    """Remove a token from text that is about to be printed."""
    return (text or "").replace(token, "***")


def api(
    token: str,
    method: str,
    path: str,
    body=None,
    *,
    follow_redirects: bool = False,
    raw_body: bytes | None = None,
    content_type: str | None = None,
):
    """Call the GitHub REST API with the installation token.

    `follow_redirects` matters for the Actions logs endpoints: they
    answer 302 with a signed blob-storage URL, and WITHOUT following it
    the body is 0 BYTES. That is the whole reason the CI logs looked
    empty -- it was never a permissions problem.
    """
    cmd = ["curl", "-sS", "-X", method]
    if follow_redirects:
        cmd.append("-L")
    cmd += [
        "-H", "Authorization: Bearer " + token,
        "-H", "Accept: application/vnd.github+json",
        "-H", "X-GitHub-Api-Version: 2022-11-28",
    ]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    if raw_body is not None:
        cmd += ["-H", f"Content-Type: {content_type}", "--data-binary", "@-"]
    cmd.append(f"{API}{path}")
    proc = subprocess.run(
        cmd, capture_output=True,
        input=raw_body if raw_body is not None else None,
    )
    text = proc.stdout.decode("utf-8", errors="replace")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"raw": text, "stderr": proc.stderr.decode("utf-8", errors="replace")}


def api_bytes(token: str, path: str, *, follow_redirects: bool = False) -> tuple[bytes, int]:
    """GET a URL that may return BINARY (a ZIP of CI logs)."""
    cmd = ["curl", "-sS", "-o", "/dev/stdout", "-w", "\n__STATUS__%{http_code}"]
    if follow_redirects:
        cmd.append("-L")
    cmd += [
        "-H", "Authorization: Bearer " + token,
        "-H", "Accept: application/vnd.github+json",
        "-H", "X-GitHub-Api-Version: 2022-11-28",
        f"{API}{path}",
    ]
    proc = subprocess.run(cmd, capture_output=True)
    out = proc.stdout
    marker = b"\n__STATUS__"
    if marker not in out:
        return out, 0
    body, _, status = out.rpartition(marker)
    return body, int(status.strip() or 0)


def installation_repositories(token: str) -> list[dict]:
    """The repositories the installation is granted. Needs a token."""
    payload = api(token, "GET", f"/installation/repositories?per_page=100")
    repos = payload.get("repositories", []) if isinstance(payload, dict) else []
    return [r for r in repos if isinstance(r, dict)]


# ── git pushes ────────────────────────────────────────────────────────
#
# The token is passed to git through a GIT_ASKPASS helper, so it never
# appears in argv, in a shell history, in a log, or in the remote URL that
# git stores. The helper file contains NO credential -- it reads the
# token from the environment -- so it can be committed and left in place.
#
# The helper must NOT live in /tmp: this filesystem is mounted noexec on
# some boxes, and git has to exec it. It lives beside this module.
ASKPASS_PATH = Path(__file__).resolve().parent / ".gh-app-askpass.sh"


def push_with_token(
    token: str,
    repo_dir: str,
    remote: str,
    refspec: str,
    *,
    extra_args: list[str] | None = None,
    timeout: int = 120,
) -> subprocess.CompletedProcess:
    """`git push` with the installation token, via an askpass helper."""
    if not ASKPASS_PATH.exists():
        raise SystemExit(f"::error::the askpass helper is missing: {ASKPASS_PATH}")
    # Git execs this file directly, so it MUST carry the execute bit.
    # It is committed 0644, so it is made executable for the push.
    mode = ASKPASS_PATH.stat().st_mode
    ASKPASS_PATH.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    env = dict(os.environ)
    env["GIT_ASKPASS"] = str(ASKPASS_PATH)
    env["GITHUB_APP_TOKEN"] = token
    env["GIT_TERMINAL_PROMPT"] = "0"
    try:
        cmd = ["git", "-C", repo_dir, "push", *(extra_args or []), remote, refspec]
        return subprocess.run(
            cmd, env=env, capture_output=True, text=True, timeout=timeout,
        )
    finally:
        ASKPASS_PATH.chmod(mode)


if __name__ == "__main__":
    # A tiny self-check: mint a token and list what it can see.
    tok = installation_token()
    print("the installation token covers:")
    for r in installation_repositories(tok):
        print(f"  {r['full_name']:<44} private={r['private']}")
