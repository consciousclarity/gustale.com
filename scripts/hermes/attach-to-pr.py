#!/usr/bin/env python3
"""
Attach files to an existing pull request, using the GitHub API.

WHY THE CLI WAS DROPPED
------------------------
GitHub's asset-upload endpoint requires multipart form data with an
explicit Content-Length -- curl's `-F` sends the body chunked and
GitHub answers "Bad Size". The body is therefore built here, where its
exact length is known, and posted with the length stated. The bytes
never touch argv.

WHY A SHARED MINT
-----------------
The token is minted by `scripts/hermes/gh_app_auth.py` -- the ONE shared
mint -- and it covers EVERY repository the App is installed on
(`gustale.com`, `gustale-state`, `gustale.recipes`).

It used to be minted HERE with its own copy of the JWT code and a
hardcoded key path of `/home/gustale/.hermes/...`, which does not exist
on the local WSL account (`alex`). That made the helper raise
FileNotFoundError on this box, which reads like "the App is broken" when
the App is fine.

The token is never printed and never written to a file.

A NOTE ON THE UPLOAD HOST
-------------------------
The asset endpoint lives on `uploads.github.com`, NOT on
`api.github.com`. `api()` prepends the API host to whatever path it is
given, so passing a FULL upload URL to it produced the malformed
`https://api.github.comhttps://uploads.github.com/...` -- which curl
reports as "Could not resolve host: api.github.comhttps". That reads
like broken DNS and is not. `api_upload()` is the fix: the same token
and headers, the uploads host.

AND THE ENDPOINT ITSELF
-----------------------
As of 2026-11-17 GitHub no longer serves this endpoint at all:
`GET /repos/<owner>/<repo>/issues/<n>/assets` answers 404 for EVERY
repository -- including `github/docs` -- and the upload host answers
422 "Bad Size" for every multipart body, including a 5-byte one. The
helper therefore reports that plainly instead of retrying forever.
"""
from __future__ import annotations

import json
import mimetypes
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gh_app_auth import api, api_upload, installation_token  # noqa: E402


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: attach-to-pr.py <repo> <pr-number> <file> [file ...]")
        return 2

    repo, number = sys.argv[1], sys.argv[2]
    files = sys.argv[3:]

    tok = installation_token()

    # Is the asset endpoint alive at all? If it answers 404 for the
    # listing, it is gone, and an upload will fail with a confusing
    # "Bad Size" instead of a clear "this endpoint no longer exists".
    listing = api(
        tok, "GET",
        f"/repos/consciousclarity/{repo}/issues/{number}/assets",
    )
    if isinstance(listing, dict) and listing.get("message") == "Not Found":
        print(
            "  the GitHub issue-asset endpoint is GONE: "
            f"GET /repos/consciousclarity/{repo}/issues/{number}/assets -> 404"
        )
        print(
            "  images cannot be uploaded to a PR comment by the App. "
            "Commit them under docs/ and link raw.githubusercontent.com "
            "instead (the repo already does this: docs/gus-238-screenshots/)."
        )
        return 3

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

        payload = api_upload(
            tok, "POST",
            f"/repos/consciousclarity/{repo}/issues/{number}/assets",
            raw_body=body,
            content_type=f"multipart/form-data; boundary={boundary}",
        )
        if isinstance(payload, dict) and "browser_download_url" in payload:
            print(f"  attached: {p.name}")
            print(f"    {payload['browser_download_url']}")
        else:
            print(f"  FAILED {p.name}: {json.dumps(payload)[:400]}")
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
