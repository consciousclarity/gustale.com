#!/usr/bin/env python3
"""
Open a pull request as the gustale-bot App.

WHY A SHARED MINT
-----------------
The token is minted by `scripts/hermes/gh_app_auth.py` -- the ONE shared
mint -- and it covers EVERY repository the App is installed on
(`gustale.com`, `gustale-state`, `gustale.recipes`).

It used to be minted HERE with its own copy of the JWT code and its own
repository list, while `gh-app.sh` minted a different list. That drift is
how a helper ended up able to see `gustale.com` but not `gustale-state`:
an installation token carries NO permission on a repository it does not
name.

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
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gh_app_auth import API, OWNER, api, installation_token  # noqa: E402


def existing_open_pr(tok: str, repo: str, head: str):
    """Return the html_url of an already-open PR for this head, or None.

    GitHub's create-PR endpoint does NOT refuse a duplicate: a re-run
    of this helper against a branch that already has an open PR opens
    PR #2 for the same head. So the check happens BEFORE the create.

    It is a GET, so it is safe to run against any repo the App is on.
    """
    owner = repo.split("/")[0] if "/" in repo else OWNER
    name = repo.split("/")[-1]
    payload = api(
        tok, "GET",
        f"/repos/{owner}/{name}/pulls?head={owner}:{head}&state=open",
    )
    if isinstance(payload, list) and payload:
        return payload[0].get("html_url")
    return None


def main() -> int:
    if len(sys.argv) < 5:
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

    tok = installation_token()

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
    if not isinstance(result, dict) or "number" not in result:
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
        tmpl = pr.get("upload_url", "") if isinstance(pr, dict) else ""
        if not tmpl:
            print("  could not read the upload URL; skipping the images")
            images = []
        upload_url = tmpl.split("{")[0]
        for img in images:
            p = Path(img)
            if not p.exists():
                print(f"  skipped (not found): {p}")
                continue
            ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
            out = api(
                tok, "POST", upload_url,
                raw_body=p.read_bytes(), content_type=ctype,
            )
            if isinstance(out, dict) and "browser_download_url" in out:
                print(f"  attached: {p.name} -> {out['browser_download_url']}")
            else:
                print(f"  FAILED to attach {p.name}: "
                      f"{json.dumps(out)[:300]}")

    print(f"\n{number}\t{url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
