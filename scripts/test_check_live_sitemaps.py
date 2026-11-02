#!/usr/bin/env python3
"""The post-deploy sitemap check's own tests.

WHAT THIS PROVES
----------------
`scripts/check-live-sitemaps.sh` is the gate that stops a deploy from
being reported as clean when one of the two sites is a stale build.

A gate that can pass on ABSENCE is worse than no gate, so each test
below runs the check against a controlled stub server and asserts it
FAILS when it should. In particular:

- a domain serving a stale sitemap FAILS;
- a domain serving NO sitemap FAILS (the absence case);
- a domain serving an EMPTY sitemap FAILS;
- both domains stale by the same amount still FAIL (the expectation
  is checked, not just the agreement).

USAGE
-----
    python3 scripts/test_check_live_sitemaps.py
"""

from __future__ import annotations

import http.server
import os
import socketserver
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CHECK = REPO / "scripts" / "check-live-sitemaps.sh"

PASSED: list[str] = []
FAILED: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        PASSED.append(name)
        print(f"  PASS: {name}")
    else:
        FAILED.append(f"{name}{(' — ' + detail) if detail else ''}")
        print(f"  FAIL: {name}{(' — ' + detail) if detail else ''}")


# ── the stub server ─────────────────────────────────────────────────────
# It routes on the Host header: stub-a.test -> a.xml, stub-b.test ->
# b.xml. A request for a host it does not know gets a 404, which is
# what the "the sitemap is missing" case needs.

class StubHandler(http.server.BaseHTTPRequestHandler):
    served_dir = ""

    def do_GET(self) -> None:  # noqa: N802
        host = (self.headers.get("Host") or "").split(":")[0]
        key = {"stub-a.test": "a.xml", "stub-b.test": "b.xml"}.get(host)
        if key is None:
            self.send_error(404)
            return
        path = os.path.join(self.served_dir, key)
        if not os.path.exists(path):
            self.send_error(404)
            return
        body = open(path, "rb").read()
        self.send_response(200)
        self.send_header("Content-Type", "application/xml")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args) -> None:
        pass


def make_sitemap(path: Path, count: int) -> None:
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for i in range(count):
        lines.append(f"  <url><loc>https://gustale.com/dishes/dish-{i + 1}/</loc></url>")
    lines.append("</urlset>")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_check(stub_port: int, expected: int) -> str:
    env = dict(os.environ)
    env["DOMAINS"] = "stub-a.test stub-b.test"
    env["STUB_URL_BASE"] = f"http://127.0.0.1:{stub_port}"
    r = subprocess.run(
        ["bash", str(CHECK), str(expected)],
        capture_output=True, text=True, env=env,
    )
    return r.stdout + r.stderr


def main() -> int:
    if not CHECK.exists():
        print(f"  FAIL: {CHECK} does not exist")
        return 1

    tmp = Path(tempfile.mkdtemp())
    StubHandler.served_dir = str(tmp)
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", 0), StubHandler)
    port = srv.server_address[1]
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()

    try:
        print("=== the post-deploy sitemap check's tests ===")

        # 1. Both correct → PASS.
        make_sitemap(tmp / "a.xml", 1531)
        make_sitemap(tmp / "b.xml", 1531)
        out = run_check(port, 1531)
        check(
            "both domains serving the expected count passes",
            "the post-deploy sitemap check: PASSED" in out,
            out.strip().splitlines()[-1] if out.strip() else "no output",
        )

        # 2. One domain stale (the 2026-11-02 failure) → FAIL.
        make_sitemap(tmp / "b.xml", 1643)
        out = run_check(port, 1531)
        check(
            "a stale domain FAILS the check",
            "the post-deploy sitemap check: FAILED" in out,
            "the check passed a stale build",
        )
        check(
            "the disagreement between the two domains is reported",
            "DISAGREE" in out,
            "no DISAGREE message",
        )

        # 3. Both stale by the same amount → FAIL (the expectation is
        #    still checked, not just the agreement).
        make_sitemap(tmp / "a.xml", 1643)
        make_sitemap(tmp / "b.xml", 1643)
        out = run_check(port, 1531)
        check(
            "both domains stale by the same amount still FAIL",
            "the post-deploy sitemap check: FAILED" in out,
            "the check passed",
        )

        # 4. A domain serving NOTHING → FAIL. The absence case.
        (tmp / "b.xml").unlink(missing_ok=True)
        out = run_check(port, 1531)
        check(
            "a domain serving no sitemap FAILS the check",
            "the post-deploy sitemap check: FAILED" in out,
            "the check passed an absent sitemap",
        )
        check(
            "the absent sitemap is reported as such",
            "returned no URLs" in out,
            "no explicit message",
        )

        # 5. An EMPTY sitemap → FAIL.
        make_sitemap(tmp / "b.xml", 0)
        out = run_check(port, 1531)
        check(
            "an empty sitemap FAILS the check",
            "the post-deploy sitemap check: FAILED" in out,
            "the check passed an empty sitemap",
        )

        # 6. Exactly one result marker, so a CI step that greps for it
        #    cannot match a partial or doubled run.
        make_sitemap(tmp / "a.xml", 1531)
        make_sitemap(tmp / "b.xml", 1531)
        out = run_check(port, 1531)
        markers = out.count("the post-deploy sitemap check:")
        check(
            "the check prints exactly one result marker",
            markers == 1,
            f"found {markers}",
        )

        # 7. The check's exit code must be non-zero on failure — CI reads
        #    the exit code, not the text.
        env = dict(os.environ)
        env["DOMAINS"] = "stub-a.test stub-b.test"
        env["STUB_URL_BASE"] = f"http://127.0.0.1:{port}"
        make_sitemap(tmp / "b.xml", 999)
        r = subprocess.run(["bash", str(CHECK), "1531"], capture_output=True, text=True, env=env)
        check(
            "the check exits non-zero on failure",
            r.returncode != 0,
            f"the exit code was {r.returncode}",
        )
        make_sitemap(tmp / "b.xml", 1531)
        r = subprocess.run(["bash", str(CHECK), "1531"], capture_output=True, text=True, env=env)
        check(
            "the check exits zero on success",
            r.returncode == 0,
            f"the exit code was {r.returncode}",
        )

    finally:
        srv.shutdown()

    print()
    print(f"=== the post-deploy sitemap check's tests: {len(PASSED)} passed, {len(FAILED)} failed")
    for f in FAILED:
        print(f"    !! {f}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
