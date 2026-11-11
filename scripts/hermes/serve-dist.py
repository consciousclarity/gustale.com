#!/usr/bin/env python3
"""
A STATIC server for the built dist, for the screenshot harness.

WHY NOT `python3 -m http.server`
-------------------------------
It is SINGLE-THREADED. The browser opens several connections at once —
the HTML, the CSS, the JS bundles, the images — and the single-threaded
server handles them one at a time, so a request that arrives while
another is blocked waits for it. With `fullPage: true` screenshots the
browser also opens extra connections, and the whole thing deadlocks:
the page never finishes loading and the run times out.

`ThreadingHTTPServer` handles each request on its own thread, so the
page loads the way a real server would.

IT ALSO SERVES THE DIRECTORY INDEX
----------------------------------
`SimpleHTTPRequestHandler` does that already, but only for a path that
ends in "/". The harness asks for `/dishes/moussaka-greek` (no trailing
slash), which a real nginx serves as the directory's `index.html` via
its `try_files` chain. So a path with no extension and no trailing
slash that resolves to a directory is served from that directory's
`index.html` — with a 200, because the page EXISTS.

That is what makes the "the recipe page is a 404" test meaningful: the
harness asks for a slug that does not exist and gets a 404, and asks
for one that does and gets the page.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DIST = Path(sys.argv[1] if len(sys.argv) > 1 else "apps/web/dist").resolve()
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8899


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def log_message(self, fmt, *args):
        pass  # quiet

    def end_headers(self):
        # No caching, so a rebuild is picked up without restarting the
        # server.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        raw = self.path.split("?", 1)[0].split("#", 1)[0]
        candidate = DIST / raw.lstrip("/")

        # THE DISH COVER IMAGES live on the object store (MinIO), not in
        # the repo — in production they are served from /media/ by
        # nginx, and the paths in the baked HTML are relative to it.
        #
        # The static server has no /media/ directory, so every cover
        # image 404s. That is a HARNESS artifact — the page is not
        # broken, the file is simply not in the dist — but it shows up
        # as a failed request in the console check, and it leaves the
        # screenshot with a broken-image placeholder instead of the
        # cover.
        #
        # So /media/ is answered with a 1x1 transparent PNG. The
        # screenshot then shows the real layout, and the console check
        # sees no failed request. The check is honest about it: this
        # server is a static-file server, and the media is not a static
        # file in the repo.
        if raw.startswith("/media/"):
            import io

            png = bytes.fromhex(
                "89504e470d0a1a0a0000000d494844520000000100000001"
                "08060000001f15c4890000000a49444154789c636000000200"
                "0100ffff03000006000557bfabd40000000049454e44ae426082"
            )
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(png)))
            self.end_headers()
            return io.BytesIO(png)

        # A path with no file extension that names a DIRECTORY is
        # served from that directory's index.html — the nginx try_files
        # behaviour.
        if (
            not raw.endswith("/")
            and "." not in raw.rsplit("/", 1)[-1]
            and candidate.is_dir()
            and (candidate / "index.html").exists()
        ):
            self.path = raw.rstrip("/") + "/index.html"
            return super().send_head()

        # A path that does not exist serves 404.html with a 404 STATUS,
        # exactly as the real site does.
        target = candidate
        if target.is_dir():
            target = target / "index.html"
        if not target.exists():
            fallback = DIST / "404.html"
            if fallback.exists():
                body = fallback.read_bytes()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                import io

                return io.BytesIO(body)

        return super().send_head()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[static] serving {DIST} on http://127.0.0.1:{PORT}", flush=True)
    server.serve_forever()
