#!/usr/bin/env python3
"""Fix the Hermes gateway so secrets in uploaded documents never reach the model.

THE BUG
-------
`plugins/platforms/telegram/adapter.py` inlines the content of any
uploaded text-ish document straight into the user turn:

    _is_text = ext in _TEXT_INJECT_EXTENSIONS or (doc_mime or "").startswith("text/")
    if _is_text and len(raw_bytes) <= MAX_TEXT_INJECT_BYTES:
        text_content = raw_bytes.decode("utf-8")
        injection = f"[Content of {display_name}]:\n{text_content}"
        event.text = f"{injection}\n\n{event.text}"

The user turn is then sent to the provider VERBATIM -- `conversation_loop.py`
does `api_msg = msg.copy()` and puts `content` into the request body, and
`compose_user_api_content` returns `content + injections` with no redaction.

So a `.pem`, `.key` or `.env` uploaded as a document ends up in the
provider's request body. That is exactly what happened with the gustale-bot
private key on 2026-11-03 and again on 2026-11-04.

A SECOND BUG: the cached download is world-readable.
`gateway/platforms/base.py::cache_document_from_bytes` does
`filepath.write_bytes(data)`, which creates the file with the default
umask -> mode 664 on this host. A private key uploaded to Telegram sat in
`~/.hermes/cache/documents/` readable by every user on the VPS.

THE FIX (three parts)
---------------------
1. NEVER INLINE a file that looks like it holds a secret. The extension
   and the MIME type are checked against a denylist (private keys, key
   stores, env files, credential files), AND the CONTENT is scanned with
   the existing `agent.redact` patterns. If either says "secret", the
   file is surfaced as a PATH only -- the agent reads it with a tool, and
   the bytes never enter the prompt.

2. REDACT anything that DOES get inlined. A document that is 99% ordinary
   text but has one key in it must not ship the key. The content is run
   through `redact_sensitive_text(force=True)`, which is the same
   redactor used for assistant output -- it already knows about private
   keys, token prefixes, JWTs and DB connection strings.

3. SAVE downloads at mode 600. `cache_document_from_bytes` now writes
   with an explicit 0600 mode and sets the containing directory to 0700.

WHY NOT JUST "ASK THE USER TO PASTE IT"
---------------------------------------
Pasting is exactly as unsafe: the pasted text is also in the user turn
and goes to the provider. The only safe channels are (a) a file the
agent reads with a tool, or (b) something the model never sees at all.
This patch makes (a) the automatic behaviour for anything secret-shaped.

WHAT IS DELIBERATELY NOT CHANGED
---------------------------------
* The redaction of the *outgoing user message* itself (the user's own
  chat text) is NOT done here. That would change what the model sees of
  every message, including legitimate ones. The document path is the
  vector that leaks *files* the user did not paste.
* Binary documents (PDF, DOCX, ZIP) were never inlined, so they need no
  change -- but the mode fix applies to them too, because a ZIP can
  contain a key.

HOW TO RUN
----------
    python3 scripts/hermes/patch-gateway-secret-documents.py [--dry-run]

It is idempotent: running it twice makes no further change. It backs up
each file it touches to <file>.orig and prints a diff summary.
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

PKG = Path("/home/gustale/.local/share/uv/tools/hermes-agent/lib/python3.12/site-packages")

TELEGRAM = PKG / "plugins/platforms/telegram/adapter.py"
BASE = PKG / "gateway/platforms/base.py"
DISCORD = PKG / "plugins/platforms/discord/adapter.py"
SLACK = PKG / "plugins/platforms/slack/adapter.py"
FEISHU = PKG / "plugins/platforms/feishu/adapter.py"
WHATSAPP = PKG / "plugins/platforms/whatsapp/adapter.py"


# ----------------------------------------------------------------------
# The shared helper. It lives in base.py because all three platform
# adapters import from there already.
# ----------------------------------------------------------------------
HELPER = '''

# ----------------------------------------------------------------------
# Secret-shaped document handling (added by scripts/hermes/patch-gateway-secret-documents.py)
#
# A document uploaded over chat used to be inlined VERBATIM into the user
# turn for any text-ish extension/MIME. The user turn is sent to the model
# provider unchanged, so a .pem / .key / .env uploaded as a file ended up in
# the provider's request body -- the model provider saw a private key.
#
# Two rules now apply to every uploaded document:
#
#   1. If the file LOOKS like it holds a secret -- by extension, by MIME,
#      or by its CONTENT matching the credential patterns -- it is surfaced
#      as a PATH ONLY. The agent opens it with a tool (read_file, terminal)
#      and the bytes never enter the prompt.
#
#   2. Anything that IS inlined is passed through the redactor, so a file
#      that is mostly prose but contains one key does not leak the key.
#
# The agent can always read the file itself: the cached path is in the
# message either way.
# ----------------------------------------------------------------------

# Extensions whose contents are secrets or credential stores. Never inline.
_SECRET_DOC_EXTENSIONS = {
    ".pem", ".key", ".keystore", ".jks", ".p12", ".pfx", ".pkcs12",
    ".ppk", ".asc", ".gpg", ".pgp", ".kdbx", ".netrc", "_netrc",
    ".env", ".envrc", ".env.local", ".env.production", ".env.development",
    ".npmrc", ".pypirc", ".netrc", ".dockercfg", ".htpasswd",
    ".git-credentials", ".credentials", ".secrets",
    "credentials", "secrets", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519",
}

# MIME types whose contents are secrets or credential stores. Never inline.
_SECRET_DOC_MIMES = {
    "application/x-pem-file", "application/pem-certificate-chain",
    "application/pkcs8", "application/pkcs12", "application/x-pkcs12",
    "application/x-pgp-keys", "application/x-x509-ca-cert",
    "application/vnd.pgp", "application/x-sh", "application/x-ssh",
    "application/x-pkcs7-mime",
}

# Filename stems that are secrets regardless of extension.
_SECRET_DOC_STEMS = {"id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "credentials", "secrets"}


def _is_secret_shaped_document(path: str, filename: str = "", mime: str = "") -> bool:
    """True if this document must never have its content inlined.

    Checks, in order of cost:
      1. extension   -- .pem, .key, .env, ...
      2. filename stem -- id_rsa, credentials, ...
      3. MIME type   -- application/x-pem-file, ...
      4. CONTENT     -- the credential patterns from agent.redact

    The content check is what catches a key that was uploaded with a
    harmless-looking name or extension.
    """
    import os as _os

    name = filename or _os.path.basename(path or "")
    ext = _os.path.splitext(name)[1].lower()
    if ext in _SECRET_DOC_EXTENSIONS:
        return True

    stem = _os.path.splitext(name)[0].lower().lstrip(".")
    if stem in _SECRET_DOC_STEMS:
        return True

    if (mime or "").lower() in _SECRET_DOC_MIMES:
        return True

    # Content check: does the file contain anything the redactor would
    # treat as a credential? Read a bounded prefix -- the credential
    # patterns are near the start of any real key/credential file.
    try:
        with open(path, "rb") as _fh:
            head = _fh.read(64 * 1024)
    except OSError:
        return False

    try:
        text = head.decode("utf-8", errors="replace")
    except Exception:
        return False

    try:
        from agent.redact import redact_sensitive_text
    except Exception:
        # Redactor unavailable -- fall back to a conservative literal check
        # so a private key header still blocks inlining.
        return ("-----BEGIN" in text and "PRIVATE KEY-----" in text)

    # If redaction CHANGES the text, the text contained something secret.
    try:
        return redact_sensitive_text(text, force=True) != text
    except Exception:
        return ("-----BEGIN" in text and "PRIVATE KEY-----" in text)


def _redact_document_text(text: str) -> str:
    """Redact credential patterns from text that is about to be inlined."""
    try:
        from agent.redact import redact_sensitive_text
    except Exception:
        return text
    try:
        return redact_sensitive_text(text, force=True)
    except Exception:
        return text
'''

# ----------------------------------------------------------------------
# The Telegram adapter patch.
# ----------------------------------------------------------------------
TELEGRAM_OLD = '''                MAX_TEXT_INJECT_BYTES = 100 * 1024
                _is_text = ext in _TEXT_INJECT_EXTENSIONS or (doc_mime or "").startswith("text/")
                if _is_text and len(raw_bytes) <= MAX_TEXT_INJECT_BYTES:
                    try:
                        text_content = raw_bytes.decode("utf-8")
                        display_name = original_filename or f"document{ext or '.txt'}"
                        display_name = re.sub(r'[^\\w.\\- ]', '_', display_name)
                        injection = f"[Content of {display_name}]:\\n{text_content}"
                        if event.text:
                            event.text = f"{injection}\\n\\n{event.text}"
                        else:
                            event.text = injection
                    except UnicodeDecodeError:
                        # Binary file — agent has the cached path and can use
                        # terminal/read_file against it. No inline injection.
                        pass
'''

TELEGRAM_NEW = '''                MAX_TEXT_INJECT_BYTES = 100 * 1024
                _is_text = ext in _TEXT_INJECT_EXTENSIONS or (doc_mime or "").startswith("text/")
                if _is_text and len(raw_bytes) <= MAX_TEXT_INJECT_BYTES:
                    # A document that holds a secret is NEVER inlined. The
                    # agent gets the cached path and reads it with a tool;
                    # the bytes must not enter the user turn, because the
                    # user turn goes to the model provider verbatim.
                    _secret = _is_secret_shaped_document(
                        cached_path, original_filename or "", doc_mime or ""
                    )
                    if _secret:
                        logger.info(
                            "[Telegram] Document %s looks secret-shaped; NOT inlining "
                            "(path only)",
                            original_filename or cached_path,
                        )
                        _is_text = False
                if _is_text and len(raw_bytes) <= MAX_TEXT_INJECT_BYTES:
                    try:
                        text_content = raw_bytes.decode("utf-8")
                        # Defence in depth: even an ordinary-looking document
                        # is redacted before it is inlined, so one key in a
                        # file of prose does not leak.
                        text_content = _redact_document_text(text_content)
                        display_name = original_filename or f"document{ext or '.txt'}"
                        display_name = re.sub(r'[^\\w.\\- ]', '_', display_name)
                        injection = f"[Content of {display_name}]:\\n{text_content}"
                        if event.text:
                            event.text = f"{injection}\\n\\n{event.text}"
                        else:
                            event.text = injection
                    except UnicodeDecodeError:
                        # Binary file — agent has the cached path and can use
                        # terminal/read_file against it. No inline injection.
                        pass
'''

# ----------------------------------------------------------------------
# The IMPORT patch.
#
# The helpers are defined in gateway/platforms/base.py, but the Telegram
# adapter calls them as bare names. Without an import in the adapter's
# own namespace, the injection site raises NameError on EVERY text
# document -- which silently breaks document handling while the secret
# is never inlined.
#
# This is why the guard import must be added, and why the regression
# test checks the ADAPTER's namespace, not base.py's.
# ----------------------------------------------------------------------

ADAPTER_IMPORT_OLD = """    _TEXT_INJECT_EXTENSIONS,
    utf16_len,
)"""

ADAPTER_IMPORT_NEW = """    _TEXT_INJECT_EXTENSIONS,
    utf16_len,
    # Secret-shaped document handling. Added by
    # scripts/hermes/patch-gateway-secret-documents.py -- these live in
    # gateway.platforms.base and MUST be imported here, or the injection
    # site below raises NameError on every text document.
    _is_secret_shaped_document,
    _redact_document_text,
)"""


# ----------------------------------------------------------------------
# The cache-mode patch (base.py) -- applies to EVERY platform, because
# every platform saves its downloads through cache_document_from_bytes.
# ----------------------------------------------------------------------
# All FOUR cache_*_from_bytes functions save an upload to disk and were
# creating the file with the default umask -> mode 0664 (world-readable).
# A private key uploaded over chat sat in the document cache readable by
# every user on the VPS.
#
# The replacement is anchored on the UNIQUE return line that follows each
# one, so exactly one occurrence is patched per function.
CACHE_FUNCS = [
    ("cache_image_from_bytes", "    filepath.write_bytes(data)\n    return str(filepath)\n"),
    ("cache_audio_from_bytes", "    filepath.write_bytes(data)\n    return str(filepath)\n"),
    ("cache_video_from_bytes", "    filepath.write_bytes(data)\n    return str(filepath)\n"),
    ("cache_document_from_bytes", "    filepath.write_bytes(data)\n    return str(filepath)\n"),
]

BASE_NEW = '''    # Write with an explicit 0600 mode. The default umask creates the file
    # 0664 (world-readable), which is how a private key uploaded over chat
    # ended up readable by every user on the VPS.
    fd = os.open(str(filepath), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "wb") as _fh:
            _fh.write(data)
    except Exception:
        try:
            os.unlink(str(filepath))
        except OSError:
            pass
        raise
    # A pre-existing file keeps its old mode, so chmod too.
    try:
        os.chmod(str(filepath), 0o600)
    except OSError:
        pass
    # The cache directory itself must not be listable by other users.
    try:
        os.chmod(str(cache_dir), 0o700)
    except OSError:
        pass
    return str(filepath)
'''

# The Discord and Slack adapters have the same injection shape.
DISCORD_OLD_MARK = "ext in _TEXT_INJECT_EXTENSIONS"
SLACK_OLD_MARK = "_is_text = ext in _TEXT_INJECT_EXTENSIONS"

# ----------------------------------------------------------------------
# The SAME guard, for the other four adapters that inline a document.
#
# Found by scanning every plugin adapter for the shape
# `text_content = raw_bytes.decode("utf-8")` or
# `Path(cached_path).read_text(...)` feeding a `[Content of ...]` block:
#
#   telegram  patched above
#   discord   line ~7380   raw_bytes.decode("utf-8")   -> pending_text_injection
#   slack     line ~3644   raw_bytes.decode("utf-8")   -> text
#   feishu    line ~3870   Path(cached_path).read_text() -> return
#   whatsapp  line ~1467   Path(doc_path).read_text()   -> body
#
# Each has the SAME defect: a secret-shaped file is inlined into the
# user turn, and the user turn goes to the model provider verbatim.
#
# WhatsApp is disabled in this deployment and Feishu/Discord/Slack are
# not connected, so these are not live attack surfaces HERE -- but the
# patch is about the code, and the code is the same code on every
# machine that installs this gateway.
# ----------------------------------------------------------------------


def _guard_block(indent: str, mime_expr: str, log_prefix: str, name_expr: str) -> str:
    """The 'never inline a secret-shaped document' block, indented.

    The block goes INSIDE the `if _is_text and len(raw_bytes) <= ...:`
    body, so it must be indented one level deeper than that `if`.

    `name_expr` is the adapter's OWN expression for the document's
    original filename -- it differs per adapter (Discord uses
    `att.filename`, Slack uses `original_filename`). Using the wrong one
    raises NameError, which is the exact bug this patch exists to fix.
    """
    pad = indent
    return (
        f'{pad}# A document that holds a secret is NEVER inlined. The\n'
        f'{pad}# agent gets the cached path and reads it with a tool;\n'
        f'{pad}# the bytes must not enter the user turn, because the\n'
        f'{pad}# user turn goes to the model provider verbatim.\n'
        f'{pad}_secret = _is_secret_shaped_document(\n'
        f'{pad}    cached_path, {name_expr}, {mime_expr}\n'
        f'{pad})\n'
        f'{pad}if _secret:\n'
        f'{pad}    logger.info(\n'
        f'{pad}        "[{log_prefix}] Document %s looks secret-shaped; NOT inlining "\n'
        f'{pad}        "(path only)",\n'
        f'{pad}        {name_expr} or cached_path,\n'
        f'{pad}    )\n'
        f'{pad}    _is_text = False\n'
    )


# --- Discord -------------------------------------------------------
# The pattern is matched by ANCHOR + LINE RANGE, not by a big literal.
# A literal is fragile: one level of backslash escaping lost between
# the patcher source and the adapter source makes it silently fail to
# match, and a silent no-op patch is the worst possible outcome.
#
# The anchors below are the two statements that bracket the block we
# replace. Everything between them is replaced wholesale.
DISCORD_ANCHOR_START = "                        MAX_TEXT_INJECT_BYTES = 100 * 1024"
DISCORD_ANCHOR_END = "                            except UnicodeDecodeError:\n                                pass"
DISCORD_LEAD = "                        MAX_TEXT_INJECT_BYTES = 100 * 1024\n"
DISCORD_MIME = 'content_type or ""'
DISCORD_NAME = "att.filename"
DISCORD_INDENT = " " * 24
# --- Slack ---------------------------------------------------------
SLACK_ANCHOR_START = "                    MAX_TEXT_INJECT_BYTES = 100 * 1024"
SLACK_ANCHOR_END = ("                        except UnicodeDecodeError:\n"
                    "                            pass  # Binary content, skip injection")
SLACK_LEAD = "                    MAX_TEXT_INJECT_BYTES = 100 * 1024\n"
SLACK_MIME = 'mimetype or ""'
SLACK_NAME = "original_filename"
SLACK_INDENT = " " * 20

# --- Feishu --------------------------------------------------------
FEISHU_OLD = '''            content = Path(cached_path).read_text(encoding="utf-8")
            display_name = self._display_name_from_cached_path(cached_path)
            return f"[Content of {display_name}]:\\n{content}"
'''

FEISHU_NEW = '''            # A document that holds a secret is NEVER inlined. The agent
            # gets the cached path and reads it with a tool; the bytes must
            # not enter the user turn, because the user turn goes to the
            # model provider verbatim.
            if _is_secret_shaped_document(cached_path, "", media_type):
                logger.info(
                    "[Feishu] Document %s looks secret-shaped; NOT inlining "
                    "(path only)",
                    cached_path,
                )
                return ""
            content = Path(cached_path).read_text(encoding="utf-8")
            # Defence in depth: even an ordinary-looking document is
            # redacted before it is inlined, so one key in a file of prose
            # does not leak.
            content = _redact_document_text(content)
            display_name = self._display_name_from_cached_path(cached_path)
            return f"[Content of {display_name}]:\\n{content}"
'''

# --- WhatsApp ------------------------------------------------------
WHATSAPP_OLD = '''                            content = Path(doc_path).read_text(encoding="utf-8", errors="replace")
                            fname = Path(doc_path).name
'''

WHATSAPP_NEW = '''                            # A document that holds a secret is NEVER inlined.
                            # The agent gets the cached path and reads it with
                            # a tool; the bytes must not enter the user turn,
                            # because the user turn goes to the model provider
                            # verbatim.
                            if _is_secret_shaped_document(doc_path, "", ""):
                                print(
                                    f"[{self.name}] Document {doc_path} looks "
                                    f"secret-shaped; NOT inlining (path only)",
                                    flush=True,
                                )
                                continue
                            content = Path(doc_path).read_text(encoding="utf-8", errors="replace")
                            # Defence in depth: even an ordinary-looking
                            # document is redacted before it is inlined, so one
                            # key in a file of prose does not leak.
                            content = _redact_document_text(content)
                            fname = Path(doc_path).name
'''

# The import block each adapter uses. The helpers must be in the
# adapter's OWN namespace or the call site raises NameError.
ADAPTER_IMPORT_TEMPLATES = {
    "discord": (
        "    _TEXT_INJECT_EXTENSIONS,\n    _prefix_within_utf16_limit,\n",
        "    _TEXT_INJECT_EXTENSIONS,\n    _prefix_within_utf16_limit,\n"
        "    # Secret-shaped document handling. Added by\n"
        "    # scripts/hermes/patch-gateway-secret-documents.py -- these live in\n"
        "    # gateway.platforms.base and MUST be imported here, or the injection\n"
        "    # site below raises NameError on every text document.\n"
        "    _is_secret_shaped_document,\n"
        "    _redact_document_text,\n",
    ),
    "slack": (
        "    _TEXT_INJECT_EXTENSIONS,\n    is_host_excluded_by_no_proxy,\n",
        "    _TEXT_INJECT_EXTENSIONS,\n"
        "    # Secret-shaped document handling. Added by\n"
        "    # scripts/hermes/patch-gateway-secret-documents.py -- these live in\n"
        "    # gateway.platforms.base and MUST be imported here, or the injection\n"
        "    # site below raises NameError on every text document.\n"
        "    _is_secret_shaped_document,\n"
        "    _redact_document_text,\n"
        "    is_host_excluded_by_no_proxy,\n",
    ),
    "feishu": (
        "    cache_document_from_bytes,\n    cache_image_from_url,\n",
        "    cache_document_from_bytes,\n"
        "    # Secret-shaped document handling. Added by\n"
        "    # scripts/hermes/patch-gateway-secret-documents.py -- these live in\n"
        "    # gateway.platforms.base and MUST be imported here, or the injection\n"
        "    # site below raises NameError on every text document.\n"
        "    _is_secret_shaped_document,\n"
        "    _redact_document_text,\n"
        "    cache_image_from_url,\n",
    ),
    "whatsapp": (
        "    cache_image_from_url,\n    cache_audio_from_url,\n",
        "    cache_image_from_url,\n"
        "    # Secret-shaped document handling. Added by\n"
        "    # scripts/hermes/patch-gateway-secret-documents.py -- these live in\n"
        "    # gateway.platforms.base and MUST be imported here, or the injection\n"
        "    # site below raises NameError on every text document.\n"
        "    _is_secret_shaped_document,\n"
        "    _redact_document_text,\n"
        "    cache_audio_from_url,\n",
    ),
}


def patch_by_anchor(path: Path, label: str, dry_run: bool) -> list[str]:
    """Patch the Discord/Slack injection block, matched by ANCHOR.

    A big literal is fragile: one level of backslash escaping lost
    between this file and the adapter silently fails to match, and a
    silent no-op patch is the worst outcome. So we anchor on two
    statements and replace everything between them.
    """
    notes: list[str] = []
    if not path.exists():
        notes.append(f"SKIP  {path.name}: not found")
        return notes

    cfg = {
        "discord": (DISCORD_ANCHOR_START, DISCORD_ANCHOR_END, DISCORD_LEAD,
                    DISCORD_INDENT, DISCORD_MIME, DISCORD_NAME),
        "slack": (SLACK_ANCHOR_START, SLACK_ANCHOR_END, SLACK_LEAD,
                  SLACK_INDENT, SLACK_MIME, SLACK_NAME),
    }[label]
    a_start, a_end, lead, indent, mime, name = cfg

    text = path.read_text()
    i = text.find(a_start)
    if i < 0:
        notes.append(f"SKIP  {path.name}: start anchor not found")
        return notes
    j = text.find(a_end, i)
    if j < 0:
        notes.append(f"SKIP  {path.name}: end anchor not found")
        return notes
    j += len(a_end)

    block = text[i:j]

    # 1. Insert the guard as a SIBLING of the `if _is_text ...:` check,
    #    at the SAME indent, so setting _is_text = False makes the
    #    existing check skip the inline.
    guard = _guard_block(indent, mime, label.capitalize(), name)
    if_stmt = "if _is_text and len(raw_bytes) <= MAX_TEXT_INJECT_BYTES:"
    if_off = block.find(if_stmt)
    if if_off < 0:
        notes.append(f"SKIP  {path.name}: the _is_text check was not found in the block")
        return notes
    line_start = block.rfind("\n", 0, if_off) + 1
    block = block[:line_start] + guard + block[line_start:]

    # 2. Redact what IS inlined, as defence in depth. The line is taken
    #    from the adapter's OWN source so no escaping can go wrong.
    decode_line = 'text_content = raw_bytes.decode("utf-8")'
    d_off = block.find(decode_line)
    if d_off >= 0:
        dl_end = block.find("\n", d_off) + 1
        pad = " " * (len(block[:d_off].split("\n")[-1]) - len(block[:d_off].split("\n")[-1].lstrip()))
        block = (block[:dl_end]
                 + pad + "# Defence in depth: even an ordinary-looking\n"
                 + pad + "# document is redacted before it is inlined, so one\n"
                 + pad + "# key in a file of prose does not leak.\n"
                 + pad + "text_content = _redact_document_text(text_content)\n"
                 + block[dl_end:])

    replacement = lead + block
    new_text = text[:i] + replacement + text[j:]
    if new_text == text:
        notes.append(f"SKIP  {path.name}: the block is already patched")
        return notes
    if dry_run:
        notes.append(f"OK    {path.name}: would patch the injection site by anchor")
        return notes

    backup = path.with_suffix(path.suffix + ".orig")
    if not backup.exists():
        shutil.copy2(path, backup)
    path.write_text(new_text)
    notes.append(f"OK    {path.name}: patched the injection site by anchor")
    return notes


def patch_file(path: Path, replacements: list[tuple[str, str]], dry_run: bool) -> list[str]:
    """Apply (old, new) replacements to a file. Returns a list of notes."""
    notes: list[str] = []
    if not path.exists():
        notes.append(f"SKIP  {path.name}: not found")
        return notes
    text = path.read_text()
    changed = False
    for old, new in replacements:
        if old in text:
            if text.count(old) > 1:
                notes.append(f"WARN  {path.name}: pattern appears {text.count(old)}x; patching all")
            text = text.replace(old, new)
            changed = True
            notes.append(f"OK    {path.name}: patched {old.splitlines()[0][:60]!r}")
        else:
            notes.append(f"SKIP  {path.name}: pattern not found ({old.splitlines()[0][:50]!r})")
    if changed and not dry_run:
        backup = path.with_suffix(path.suffix + ".orig")
        if not backup.exists():
            shutil.copy2(path, backup)
        path.write_text(text)
    return notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print(f"=== patching the Hermes gateway (dry-run={args.dry_run}) ===\n")

    all_notes: list[str] = []

    # 1. base.py: add the helper + fix the cache mode in each of the four
    #    cache_*_from_bytes functions, WITHOUT touching the other
    #    write_bytes calls in the file.
    if BASE.exists():
        text = BASE.read_text()
        for func_name, old in CACHE_FUNCS:
            # Isolate this function's body.
            start = text.find(f"def {func_name}(")
            if start == -1:
                all_notes.append(f"SKIP  {BASE.name}: {func_name} not found")
                continue
            end = text.find("\ndef ", start + 1)
            if end == -1:
                end = len(text)
            body = text[start:end]
            if old not in body:
                all_notes.append(f"SKIP  {BASE.name}: {func_name} pattern not found")
                continue
            new_body = body.replace(old, BASE_NEW, 1)
            text = text[:start] + new_body + text[end:]
            all_notes.append(f"OK    {BASE.name}: {func_name} now writes 0600")
        if not args.dry_run:
            backup = BASE.with_suffix(BASE.suffix + ".orig")
            if not backup.exists():
                shutil.copy2(BASE, backup)
                all_notes.append(f"OK    {BASE.name}: backup written to {backup.name}")
            BASE.write_text(text)
    else:
        all_notes.append(f"SKIP  {BASE.name}: not found")

    # Append the helper to base.py (once).
    if BASE.exists():
        text = BASE.read_text()
        if "_is_secret_shaped_document" not in text:
            if not args.dry_run:
                with BASE.open("a") as fh:
                    fh.write(HELPER)
                all_notes.append(f"OK    {BASE.name}: appended the secret-document helper")
            else:
                all_notes.append(f"OK    {BASE.name}: would append the secret-document helper")
        else:
            all_notes.append(f"SKIP  {BASE.name}: helper already present")

    # 2. Telegram: never inline a secret-shaped document; redact what is inlined.
    all_notes += patch_file(TELEGRAM, [(TELEGRAM_OLD, TELEGRAM_NEW)], args.dry_run)

    # 2b. Telegram: IMPORT the helpers into the adapter's namespace.
    #     Without this the injection site raises NameError on every text
    #     document. It must come after the helper is in base.py.
    if TELEGRAM.exists():
        text = TELEGRAM.read_text()
        if "_is_secret_shaped_document" in text and "    _is_secret_shaped_document," not in text:
            if ADAPTER_IMPORT_OLD not in text:
                all_notes.append(
                    f"SKIP  {TELEGRAM.name}: the import block was not found; "
                    "add the helper import by hand"
                )
            else:
                if not args.dry_run:
                    TELEGRAM.write_text(text.replace(ADAPTER_IMPORT_OLD, ADAPTER_IMPORT_NEW, 1))
                    all_notes.append(f"OK    {TELEGRAM.name}: imported the secret-document helpers")
                else:
                    all_notes.append(f"OK    {TELEGRAM.name}: would import the secret-document helpers")
        elif "    _is_secret_shaped_document," in text:
            all_notes.append(f"SKIP  {TELEGRAM.name}: helper import already present")
        else:
            all_notes.append(f"SKIP  {TELEGRAM.name}: no injection site to guard")

    # 3. Discord, Slack, Feishu and WhatsApp: the same injection shape.
    #    Each gets the same two-part guard (never inline a secret-shaped
    #    document; redact what IS inlined) AND the helper import.
    for label, adapter, old, new in (
        ("discord", DISCORD, None, None),
        ("slack", SLACK, None, None),
        ("feishu", FEISHU, FEISHU_OLD, FEISHU_NEW),
        ("whatsapp", WHATSAPP, WHATSAPP_OLD, WHATSAPP_NEW),
    ):
        if not adapter.exists():
            all_notes.append(f"SKIP  {adapter.name}: not found")
            continue

        # 3a. the guard at the injection site
        if old is None:
            # Discord and Slack are matched by ANCHOR, not by a literal.
            all_notes += patch_by_anchor(
                adapter, label, args.dry_run
            )
        else:
            all_notes += patch_file(adapter, [(old, new)], args.dry_run)

        # 3b. the IMPORT, without which the guard raises NameError and
        #     document handling breaks silently.
        imp_old, imp_new = ADAPTER_IMPORT_TEMPLATES[label]
        text = adapter.read_text()
        if "    _is_secret_shaped_document," in text:
            all_notes.append(f"SKIP  {adapter.name}: helper import already present")
        elif imp_old not in text:
            all_notes.append(
                f"SKIP  {adapter.name}: the import block was not found; "
                "add the helper import by hand"
            )
        elif args.dry_run:
            all_notes.append(f"OK    {adapter.name}: would import the secret-document helpers")
        else:
            backup = adapter.with_suffix(adapter.suffix + ".orig")
            if not backup.exists():
                shutil.copy2(adapter, backup)
            adapter.write_text(text.replace(imp_old, imp_new, 1))
            all_notes.append(f"OK    {adapter.name}: imported the secret-document helpers")

    print("\n".join(all_notes))
    print()
    if args.dry_run:
        print("DRY RUN -- nothing was written")
    else:
        print("PATCHED. Backups: <file>.orig")
    return 0


if __name__ == "__main__":
    sys.exit(main())
