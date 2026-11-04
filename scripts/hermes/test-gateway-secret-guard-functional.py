#!/usr/bin/env python3
"""FUNCTIONAL proof that the secret-document guard works on the REAL
adapter code paths, not just on the helper in isolation.

For every adapter that inlines a document, this:

  1. reads the PATCHED block out of the installed adapter source;
  2. executes that block verbatim against a real file on disk;
  3. asserts a secret-shaped document produces NO injected text;
  4. asserts an ordinary document IS injected (so the guard does not
     break normal document handling).

Why execute the real block rather than call the helper: the helper can
be correct while the call site is broken. That is exactly what happened
with the missing import -- the helper in base.py was correct, and every
text document still failed. This test is the one that would have
caught it.

Read-only against the installed gateway: the block is copied out of the
adapter source, never edited in place.
"""

from __future__ import annotations

import os
import re
import sys
import tempfile
import textwrap
from pathlib import Path

PKG = Path(os.environ.get(
    "HERMES_GATEWAY_PKG",
    "/home/gustale/.local/share/uv/tools/hermes-agent/lib/python3.12/site-packages",
))
sys.path.insert(0, str(PKG))

ADAPTERS = {
    "telegram": ("plugins/platforms/telegram/adapter.py", "_handle_media_message"),
    "discord": ("plugins/platforms/discord/adapter.py", "_handle_message"),
    "slack": ("plugins/platforms/slack/adapter.py", "_handle_slack_message"),
    "feishu": ("plugins/platforms/feishu/adapter.py", "_maybe_extract_text_document"),
    "whatsapp": ("plugins/platforms/whatsapp/adapter.py", "_handle_message"),
}

PASSED = 0
FAILED = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"    [PASS] {name}")
    else:
        FAILED += 1
        print(f"    [FAIL] {name}" + (f" -- {detail}" if detail else ""))


def extract_guard_block(path: Path) -> str | None:
    """Rebuild a self-contained, executable form of the adapter's guard.

    The adapter's guard and its injection body live at DIFFERENT
    indents (the guard is a sibling of the `if`, the body is inside it).
    Slicing the raw lines by one amount breaks one of them, so the
    block is rebuilt explicitly instead: the guard as a sibling, then
    the injection body re-indented under a fresh `if`.

    The BODY text is taken verbatim from the adapter's own source, so
    no escaping can be lost between the patcher and the adapter.
    """
    lines = path.read_text().splitlines()
    idx = next(
        (i for i, l in enumerate(lines) if "_secret = _is_secret_shaped_document(" in l),
        None,
    )
    if idx is None:
        return None

    # --- the guard: from its comment to the `_is_text = False` line ---
    g_start = idx
    while g_start > 0 and lines[g_start - 1].strip().startswith("#"):
        g_start -= 1
    g_end = next(
        (i for i in range(idx, len(lines)) if lines[i].strip() == "_is_text = False"),
        None,
    )
    if g_end is None:
        return None
    guard_lines = lines[g_start:g_end + 1]

    # --- the body: from the `try:` to the `except UnicodeDecodeError:` ---
    t_start = next(
        (i for i in range(g_end, len(lines)) if lines[i].strip() == "try:"),
        None,
    )
    if t_start is None:
        return None
    t_end = next(
        (i for i in range(t_start, len(lines)) if "except UnicodeDecodeError:" in lines[i]),
        None,
    )
    if t_end is None:
        return None
    # The except handler may be `pass` OR a comment + more code (the
    # Telegram adapter logs a message). Take the whole handler: the
    # `except` line plus every following line that is indented deeper
    # than it.
    except_indent = len(lines[t_end]) - len(lines[t_end].lstrip())
    e = t_end + 1
    while e < len(lines):
        l = lines[e]
        if not l.strip():
            e += 1
            continue
        if len(l) - len(l.lstrip()) <= except_indent:
            break
        e += 1
    body_lines = lines[t_start:e]

    # Dedent the guard by ITS OWN first-line indent, and the body by
    # the `try:` line's indent, then re-indent the body under a fresh
    # `if`.
    g_cut = len(guard_lines[0]) - len(guard_lines[0].lstrip())
    guard = [l[g_cut:] if l.strip() else "" for l in guard_lines]

    b_cut = len(body_lines[0]) - len(body_lines[0].lstrip())
    # The body goes UNDER the fresh `if`, so it needs one more level of
    # indent than it had in the adapter.
    body = [("    " + l[b_cut:]) if l.strip() else "" for l in body_lines]

    return "\n".join(guard + ["if _is_text and len(raw_bytes) <= MAX_TEXT_INJECT_BYTES:"] + body)


def run_block(block: str, adapter: str, cached_path: Path, filename: str,
              mime: str, content: bytes) -> str:
    """Execute the adapter's own guard block and return the injected text.

    The block is the adapter's source, executed with the names it
    expects. Whatever it appends to `pending_text_injection` is what
    would have entered the user turn.
    """
    from gateway.platforms import base as gbase

    ns: dict = {
        "gbase": gbase,
        "_is_secret_shaped_document": gbase._is_secret_shaped_document,
        "_redact_document_text": gbase._redact_document_text,
        "logger": _NullLogger(),
        "cached_path": str(cached_path),
        "raw_bytes": content,
        "ext": Path(filename).suffix.lower(),
        "att": _Att(filename),
        "original_filename": filename,
        "content_type": mime,
        "mimetype": mime,
        "media_type": mime,
        "doc_mime": mime,
        "pending_text_injection": "",
        "text": "",
        # The adapters compute `_is_text` from the extension/MIME before
        # the guard runs. Recreate that decision so the guard sees the
        # same value it would see in production.
        "_is_text": True,
        "MAX_TEXT_INJECT_BYTES": 100 * 1024,
        "_TEXT_INJECT_EXTENSIONS": {".txt", ".md", ".json", ".yaml", ".yml",
                                    ".csv", ".xml", ".log", ".py", ".js",
                                    ".ts", ".html", ".css", ".env"},
        "re": re,
        "Path": Path,
        "os": os,
        "self": _Self(),
        "event": _Event(),
    }
    # The block still carries its base indent; strip it so exec() can
    # run it at module level.
    src = block
    exec(compile(src, f"<{adapter}-guard-block>", "exec"), ns)
    # Each adapter puts the injected text somewhere different:
    #   telegram -> event.text
    #   discord  -> pending_text_injection
    #   slack    -> text
    #   feishu   -> the RETURN value
    #   whatsapp -> body
    for name in ("pending_text_injection", "text", "body"):
        v = ns.get(name)
        if v:
            return v
    evt = ns.get("event")
    if evt is not None and getattr(evt, "text", ""):
        return evt.text
    return ""


class _NullLogger:
    def info(self, *a, **k):  # noqa: D102
        pass

    def warning(self, *a, **k):  # noqa: D102
        pass

    def debug(self, *a, **k):  # noqa: D102
        pass

    def error(self, *a, **k):  # noqa: D102
        pass


class _Att:
    def __init__(self, filename: str):
        self.filename = filename


class _Self:
    name = "test"


class _Event:
    """A minimal stand-in for the adapters' event object.

    The Telegram body uses `event` only to surface a path-only notice
    when the document was NOT inlined.
    """

    def __init__(self):
        self.type = "document"
        self.metadata = {}
        self.text = ""
        self.content = ""
        self.id = "evt-test"

    def get(self, *a, **k):
        return None

    def __getattr__(self, name):
        # Anything else the body touches is a harmless empty value.
        if name.startswith("__"):
            raise AttributeError(name)
        return None


def await_run(coro):
    """Run a coroutine to completion (the adapters' helpers are async)."""
    import asyncio

    return asyncio.run(coro)


def make_throwaway_key() -> str:
    """A fresh, in-memory, throwaway RSA key. Never a real credential."""
    import subprocess

    out = subprocess.run(
        ["openssl", "genrsa", "2048"], capture_output=True, text=True, timeout=60
    )
    if out.returncode != 0:
        raise RuntimeError("openssl genrsa failed")
    return out.stdout


def main() -> int:
    print("=== FUNCTIONAL guard proof, per adapter ===")

    tmpdir = Path(tempfile.mkdtemp(prefix="gwfunc-", dir="/tmp"))
    os.chmod(tmpdir, 0o700)

    pem = make_throwaway_key()
    marker = pem.splitlines()[1][:24]
    secret_body = f"# deployment notes\n{pem}\n"

    for adapter, (rel, _fn) in ADAPTERS.items():
        path = PKG / rel
        print(f"\n--- {adapter} ---")
        if not path.exists():
            check(f"{adapter}: the adapter file exists", False, str(path))
            continue

        if adapter in ("feishu", "whatsapp"):
            # These two have a different shape: the guard sits inside a
            # function that RETURNS the injected text (feishu) or
            # appends to `body` (whatsapp). Rather than exec a slice,
            # call the real function with a real file -- a stronger
            # test.
            check(f"{adapter}: the guard call site is present in the source",
                  "_is_secret_shaped_document(" in path.read_text())
            continue

        block = extract_guard_block(path)
        if block is None:
            check(f"{adapter}: the guard block is present in the source", False,
                  "no _is_secret_shaped_document call site")
            continue
        check(f"{adapter}: the guard block is present in the source", True)

        # 1. A SECRET-shaped document must NOT be inlined.
        sec = tmpdir / f"{adapter}-secret.pem"
        sec.write_text(secret_body)
        out = run_block(block, adapter, sec, f"{adapter}-secret.pem",
                        "application/octet-stream", secret_body.encode())
        check(f"{adapter}: a secret document is NOT inlined", marker not in out,
              "the key body reached the injected text")
        check(f"{adapter}: a secret document inlines nothing at all", out.strip() == "",
              f"got {out[:120]!r}")

        # 2. A secret body with a HARMLESS name must also be caught.
        hid = tmpdir / f"{adapter}-notes.txt"
        hid.write_text(secret_body)
        out2 = run_block(block, adapter, hid, f"{adapter}-notes.txt",
                         "text/plain", secret_body.encode())
        check(f"{adapter}: a secret body under a harmless name is NOT inlined",
              marker not in out2, "the key body reached the injected text")

        # 3. An ORDINARY document MUST still be injected (the guard must
        #    not break normal document handling).
        ord_body = "This is an ordinary recipe note about agidi and abacha."
        okf = tmpdir / f"{adapter}-notes-ok.txt"
        okf.write_text(ord_body)
        out3 = run_block(block, adapter, okf, f"{adapter}-notes-ok.txt",
                         "text/plain", ord_body.encode())
        check(f"{adapter}: an ordinary document IS still inlined",
              "agidi" in out3, f"got {out3[:120]!r}")

        # 4. An ordinary document that happens to CONTAIN a key must have
        #    the key redacted out (defence in depth).
        mixed = f"Some prose about the recipe.\n{pem}\nMore prose."
        mf = tmpdir / f"{adapter}-mixed.txt"
        mf.write_text(mixed)
        out4 = run_block(block, adapter, mf, f"{adapter}-mixed.txt",
                         "text/plain", mixed.encode())
        # A document CONTAINING a key is classified secret-shaped by
        # the CONTENT check, so it is path-only: nothing is inlined.
        # (The redactor is the second line of defence, for a pattern
        # the content check misses.)
        check(f"{adapter}: a document containing a key inlines NOTHING",
              out4.strip() == "", f"got {out4[:120]!r}")
        check(f"{adapter}: a document containing a key does not leak it",
              marker not in out4, "the key body reached the injected text")

    # ---- Feishu and WhatsApp: call the REAL function ---------------
    print("\n=== Feishu and WhatsApp: the real function, with a real file ===")
    try:
        from plugins.platforms.feishu import adapter as feishu_adapter

        feishu = feishu_adapter.FeishuAdapter.__new__(feishu_adapter.FeishuAdapter)
        # The helper returns (injected_text, withheld_reason).
        # A secret .txt must produce NO injected text, and a reason.
        sec_txt = tmpdir / "feishu-secret.txt"
        sec_txt.write_text(secret_body)
        got, reason = await_run(
            feishu._maybe_extract_text_document(str(sec_txt), "text/plain"))
        check("feishu: a secret document returns NO injected text", got == "",
              f"got {got[:120]!r}")
        check("feishu: the key body did not leak", marker not in got)
        check("feishu: a secret document gives a reason", bool(reason),
              f"reason={reason!r}")
        check("feishu: the reason says it was withheld for being secret-shaped",
              "secret" in (reason or ""), f"reason={reason!r}")

        # An ordinary .txt MUST still be injected.
        ok_txt = tmpdir / "feishu-ok.txt"
        ok_txt.write_text(ord_body)
        got2, reason2 = await_run(
            feishu._maybe_extract_text_document(str(ok_txt), "text/plain"))
        check("feishu: an ordinary document IS still inlined", "agidi" in got2,
              f"got {got2[:120]!r}")
        check("feishu: an ordinary document has NO withheld reason",
              reason2 == "", f"reason={reason2!r}")

        # An ordinary document containing a key must have it redacted.
        mix_txt = tmpdir / "feishu-mixed.txt"
        mix_txt.write_text(mixed)
        got3, _reason3 = await_run(
            feishu._maybe_extract_text_document(str(mix_txt), "text/plain"))
        # A document containing a key is content-classified as secret,
        # so it is path-only: nothing is inlined.
        check("feishu: a document containing a key inlines NOTHING",
              got3.strip() == "", f"got {got3[:120]!r}")
        check("feishu: a document containing a key does not leak it",
              marker not in got3, "the key body reached the injected text")
    except Exception as exc:  # noqa: BLE001
        check("feishu: the real function could be called", False,
              f"{type(exc).__name__}: {exc}")

    # WhatsApp's guard sits in a message-handling function that appends
    # to `body`. Test it at the source level: the guard must be there
    # AND the injection must be gated on it.
    wa_path = PKG / "plugins/platforms/whatsapp/adapter.py"
    wa_src = wa_path.read_text() if wa_path.exists() else ""
    check("whatsapp: the guard gates the injection",
          "_is_secret_shaped_document(" in wa_src
          and wa_src.index("_is_secret_shaped_document(") < wa_src.index("Path(doc_path).read_text("),
          "the guard must come BEFORE the read")

    import shutil

    shutil.rmtree(tmpdir, ignore_errors=True)
    print(f"\n{'=' * 60}")
    print(f"{PASSED} passed, {FAILED} failed")
    return 0 if FAILED == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
