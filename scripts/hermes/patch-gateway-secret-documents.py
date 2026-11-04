#!/usr/bin/env python3
"""Fix the Hermes gateway so secrets in uploaded documents never reach the model.

THE BUG
-------
Every platform adapter that inlines an uploaded document used to put the
document's bytes straight into the user turn:

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

A THIRD BUG: the attachment note lies.
`gateway/run.py::_build_document_context_note` said, for every `text/*`
document, "Its content has been included below" -- but it decided that
from the MIME type alone. When the adapter correctly withheld a
secret-shaped document, the note still claimed the content was included.
The note must report what ACTUALLY happened.

THE FIX (four parts)
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

4. TELL THE TRUTH in the attachment note. The adapter is the component
   that decides whether content was inlined, so the adapter RECORDS its
   decision on the event (`MessageEvent.metadata`) and `gateway/run.py`
   renders the note from that record. The note never claims content was
   included unless the adapter actually inlined it, and it gives the
   reason when the content was withheld.

WHY NOT JUST "ASK THE USER TO PASTE IT"
----------------------------------------
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

HOW THIS PATCHER IS BUILT
-------------------------
* It is IDEMPOTENT and REINSTALL-SAFE: running it on an already-patched
  tree changes nothing, and running it on a pristine tree produces
  exactly the same result. Every generated block is delimited by
  ``# hermes:<name>:begin`` / ``# hermes:<name>:end`` markers, and each
  adapter's injection region is REBUILT (not appended to) from the
  target's own source lines, so a second run cannot accumulate a second
  guard.
* It FAILS LOUDLY: if an expected anchor is missing or ambiguous, the
  patcher aborts with a non-zero exit code and writes NOTHING. A silent
  no-op patch is the worst possible outcome.
* It is TRANSACTIONAL: every transformation is computed in memory first
  and only written once every one of them has succeeded.
* It is TESTABLE: ``--pkg-root`` points the patcher at a copied package
  tree, so the tests can prove idempotency and mutation-detection
  without touching the installed gateway.

HOW TO RUN
----------
    python3 scripts/hermes/patch-gateway-secret-documents.py [--dry-run]
    python3 scripts/hermes/patch-gateway-secret-documents.py --pkg-root /tmp/tree
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

DEFAULT_PKG = Path("/home/gustale/.local/share/uv/tools/hermes-agent/lib/python3.12/site-packages")

# The generated-block markers. They delimit every block this patcher writes,
# so a second run can find and remove exactly what it wrote before.
GUARD_BEGIN = "# hermes:secret-document-guard:begin"
GUARD_END = "# hermes:secret-document-guard:end"
REDACT_BEGIN = "# hermes:secret-document-redact:begin"
REDACT_END = "# hermes:secret-document-redact:end"
OUTCOME_BEGIN = "# hermes:document-outcome:begin"
OUTCOME_END = "# hermes:document-outcome:end"

# The legacy (pre-marker) blocks, written by the first version of this
# patcher. They must still be removable, or an already-patched tree could
# never be normalised. Their comment text differs from the text used by the
# current blocks, so the two can never be confused.
LEGACY_GUARD_START = "# A document that holds a secret is NEVER inlined."
LEGACY_REDACT_START = "# Defence in depth:"


class PatchError(Exception):
    """An expected anchor was missing or ambiguous. The patch must fail loudly."""


# ----------------------------------------------------------------------
# The shared helper. It lives in base.py because every platform
# adapter imports from there already.
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
# The outcome channel (added to base.py).
#
# The adapter is the only component that knows whether a document's
# content was actually inlined. It records that decision on the event's
# free-form `metadata` dict, and gateway/run.py renders the attachment
# note from the record instead of guessing from the MIME type.
# ----------------------------------------------------------------------
OUTCOME_HELPER = '''

# ----------------------------------------------------------------------
# Document inlining outcomes (added by scripts/hermes/patch-gateway-secret-documents.py)
#
# The attachment note used to say "Its content has been included below"
# for every text/* document, decided from the MIME type alone. When the
# adapter withheld a secret-shaped document, that note was a lie.
#
# The adapter now records what it actually did, and the note is built
# from the record. The channel is MessageEvent.metadata, which already
# exists as a free-form dict on the dataclass.
# ----------------------------------------------------------------------

DOCUMENT_OUTCOMES_KEY = "hermes_document_outcomes"


def record_document_outcome(
    outcomes: Optional[Dict[str, Any]],
    cached_path: str,
    included: bool,
    reason: Optional[str] = None,
) -> None:
    """Record whether a document's content was actually inlined.

    `outcomes` is a plain map of cached-path -> outcome. `included` is the
    adapter's own decision -- never inferred from the MIME type. `reason`
    explains a withheld document when the adapter knows why.
    """
    if not isinstance(outcomes, dict):
        return
    try:
        key = os.path.abspath(str(cached_path))
    except Exception:
        key = str(cached_path)
    outcomes[key] = {"included": bool(included), "reason": reason}


def document_outcomes_metadata(outcomes: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Wrap a plain outcome map so it can be put on MessageEvent.metadata."""
    if not isinstance(outcomes, dict) or not outcomes:
        return {}
    return {DOCUMENT_OUTCOMES_KEY: outcomes}


def document_outcome(
    metadata: Optional[Dict[str, Any]],
    cached_path: str,
) -> Optional[Dict[str, Any]]:
    """The recorded inlining outcome for a document, or None if unknown.

    None means "not confirmed": the note must then NOT claim the content
    was included.

    Both shapes are accepted: the event metadata (which carries the
    outcomes under DOCUMENT_OUTCOMES_KEY) and a bare outcome map. The
    bare map is what the adapters fill in before the event exists.
    """
    if not isinstance(metadata, dict):
        return None
    try:
        key = os.path.abspath(str(cached_path))
    except Exception:
        key = str(cached_path)

    for container in (metadata.get(DOCUMENT_OUTCOMES_KEY), metadata):
        if not isinstance(container, dict):
            continue
        outcome = container.get(key)
        if outcome is None:
            outcome = container.get(str(cached_path))
        if isinstance(outcome, dict):
            return outcome
    return None


def merge_document_outcomes(existing: MessageEvent, incoming: MessageEvent) -> None:
    """Carry recorded document outcomes across a merged pending event.

    A queued follow-up turn is built by merging two MessageEvents. The
    merge keeps the first event's metadata, so without this the recorded
    outcome of a document on the second event would be lost and the note
    would fall back to "not confirmed".
    """
    src = getattr(incoming, "metadata", None) or {}
    outcomes = src.get(DOCUMENT_OUTCOMES_KEY)
    if not isinstance(outcomes, dict) or not outcomes:
        return
    dst = getattr(existing, "metadata", None)
    if not isinstance(dst, dict):
        existing.metadata = {}
        dst = existing.metadata
    merged = dst.setdefault(DOCUMENT_OUTCOMES_KEY, {})
    if isinstance(merged, dict):
        merged.update(outcomes)
'''

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


# ----------------------------------------------------------------------
# Per-adapter facts.
#
# Each adapter that inlines a document has its own names for the cached
# path, the original filename, the MIME type and the logger. Using the
# wrong ones raises NameError, which is the exact bug this patch exists
# to fix, so the names are declared here rather than guessed.
# ----------------------------------------------------------------------
class AdapterSpec:
    """What the patcher needs to know about one adapter's injection site."""

    def __init__(
        self,
        label: str,
        rel: str,
        path_expr: str,
        name_expr: str,
        mime_expr: str,
        log_name_expr: str,
        log_prefix: str,
        log_style: str = "logger",
        redact_var: str = "text_content",
        uses_is_text: bool = True,
    ):
        self.label = label
        self.rel = rel
        self.path_expr = path_expr
        self.name_expr = name_expr
        self.mime_expr = mime_expr
        self.log_name_expr = log_name_expr
        self.log_prefix = log_prefix
        self.log_style = log_style
        self.redact_var = redact_var
        self.uses_is_text = uses_is_text


# The three adapters that decode the raw bytes and build an `[Content of ...]`
# injection. They share one shape and one rebuild routine.
DECODE_SPECS = [
    AdapterSpec(
        label="telegram",
        rel="plugins/platforms/telegram/adapter.py",
        path_expr="cached_path",
        name_expr='original_filename or ""',
        mime_expr='doc_mime or ""',
        log_name_expr="original_filename or cached_path",
        log_prefix="Telegram",
    ),
    AdapterSpec(
        label="discord",
        rel="plugins/platforms/discord/adapter.py",
        path_expr="cached_path",
        name_expr="att.filename",
        mime_expr='content_type or ""',
        log_name_expr="att.filename or cached_path",
        log_prefix="Discord",
    ),
    AdapterSpec(
        label="slack",
        rel="plugins/platforms/slack/adapter.py",
        path_expr="cached_path",
        name_expr="original_filename",
        mime_expr='mimetype or ""',
        log_name_expr="original_filename or cached_path",
        log_prefix="Slack",
    ),
]

# The helper names each adapter must be able to resolve in its OWN
# namespace, or its injection site raises NameError.
ADAPTER_HELPERS = [
    "_is_secret_shaped_document",
    "_redact_document_text",
    "record_document_outcome",
    "document_outcomes_metadata",
]

# The plain outcome map every adapter declares OUTSIDE its attachment loop,
# so it is defined even when the loop does not run.
OUTCOME_MAP_DECL = "document_outcomes: Dict[str, Any] = {}"


# ----------------------------------------------------------------------
# Small text helpers.
# ----------------------------------------------------------------------
def _indent_of(line: str) -> int:
    return len(line) - len(line.lstrip())


def _find_line(lines: list[str], pred, what: str, path_name: str,
               start: int = 0, end: int | None = None) -> int:
    """Index of the single line matching `pred`. Fails loudly otherwise."""
    hi = len(lines) if end is None else end
    hits = [i for i in range(start, hi) if pred(lines[i])]
    if len(hits) != 1:
        raise PatchError(
            f"{path_name}: expected exactly one {what}, found {len(hits)}"
        )
    return hits[0]


def _drop_block(lines: list[str], start_pred, end_pred, what: str,
                path_name: str) -> list[str]:
    """Remove every block that starts with `start_pred` and ends at `end_pred`."""
    out: list[str] = []
    i = 0
    while i < len(lines):
        if start_pred(lines[i]):
            j = i
            while j < len(lines) and not end_pred(lines[j]):
                j += 1
            if j >= len(lines):
                raise PatchError(f"{path_name}: unterminated {what}")
            i = j + 1
            continue
        out.append(lines[i])
        i += 1
    return out


def _drop_marker_block(lines: list[str], begin: str, end: str, what: str,
                       path_name: str) -> list[str]:
    return _drop_block(
        lines,
        lambda l: l.strip().startswith(begin),
        lambda l: l.strip().startswith(end),
        what,
        path_name,
    )


def _drop_all_markers(lines: list[str], path_name: str) -> list[str]:
    """Remove every block this patcher wrote, so the tree can be rebuilt."""
    lines = _drop_marker_block(lines, GUARD_BEGIN, GUARD_END,
                               "the guard block", path_name)
    lines = _drop_marker_block(lines, REDACT_BEGIN, REDACT_END,
                               "the redaction block", path_name)
    lines = _drop_marker_block(lines, OUTCOME_BEGIN, OUTCOME_END,
                               "the outcome block", path_name)
    return lines


def _block(indent: int, body: list[str]) -> list[str]:
    """Indent a list of source lines."""
    pad = " " * indent
    return [pad + line if line else "" for line in body]


# ----------------------------------------------------------------------
# The generated blocks.
# ----------------------------------------------------------------------
GUARD_COMMENT = [
    "# SECRET-DOCUMENT GUARD (added by",
    "# scripts/hermes/patch-gateway-secret-documents.py): a document that",
    "# holds a secret is NEVER inlined. The agent gets the cached path and",
    "# reads it with a tool; the bytes must not enter the user turn, because",
    "# the user turn goes to the model provider verbatim.",
]

REDACT_COMMENT = [
    "# SECRET-DOCUMENT REDACTION (defence in depth, added by",
    "# scripts/hermes/patch-gateway-secret-documents.py): even an",
    "# ordinary-looking document is redacted before it is inlined, so one",
    "# key in a file of prose does not leak.",
]


def _guard_block(spec: AdapterSpec, indent: int) -> list[str]:
    """The 'never inline a secret-shaped document' block.

    `spec.uses_is_text` is True for the three adapters that gate their
    injection on an `_is_text` flag. WhatsApp gates on the extension
    allow-list instead, so its guard simply skips the document.
    """
    body = [
        GUARD_BEGIN,
        *GUARD_COMMENT,
        '_withheld_reason = ""',
    ]
    if spec.log_style == "print":
        body += [
            f"if _is_secret_shaped_document({spec.path_expr}, {spec.name_expr}, {spec.mime_expr}):",
            "    print(",
            f'        f"[{{self.name}}] Document {{{spec.path_expr}}} looks "',
            '        f"secret-shaped; NOT inlining (path only)",',
            "        flush=True,",
            "    )",
            '    _withheld_reason = "it looks like it holds a secret"',
        ]
        if spec.uses_is_text:
            body.append("    _is_text = False")
        else:
            # WhatsApp has no `_is_text` flag: the document is skipped.
            body.append("    continue")
    else:
        body += [
            "_secret = _is_secret_shaped_document(",
            f"    {spec.path_expr}, {spec.name_expr}, {spec.mime_expr}",
            ")",
            "if _secret:",
            "    logger.info(",
            f'        "[{spec.log_prefix}] Document %s looks secret-shaped; NOT inlining "',
            '        "(path only)",',
            f"        {spec.log_name_expr},",
            "    )",
            '    _withheld_reason = "it looks like it holds a secret"',
            "    _is_text = False",
        ]
    body.append(GUARD_END)
    return _block(indent, body)


def _redact_block(spec: AdapterSpec, indent: int) -> list[str]:
    """Defence in depth: redact whatever IS inlined."""
    return _block(indent, [
        REDACT_BEGIN,
        *REDACT_COMMENT,
        f"{spec.redact_var} = _redact_document_text({spec.redact_var})",
        REDACT_END,
    ])


def _outcome_record(indent: int, path_expr: str, included: str,
                    reason: str) -> list[str]:
    """Record what the adapter actually did, for the attachment note."""
    return _block(indent, [
        OUTCOME_BEGIN,
        "record_document_outcome(",
        "    document_outcomes,",
        f"    {path_expr},",
        f"    included={included},",
        f"    reason={reason},",
        ")",
        OUTCOME_END,
    ])


# ----------------------------------------------------------------------
# The rebuild of a decode-style adapter's injection region.
# ----------------------------------------------------------------------
def _rebuild_decode_region(lines: list[str], spec: AdapterSpec,
                            path_name: str) -> list[str]:
    """Rebuild the `[Content of ...]` region from the adapter's own lines.

    The region is REBUILT, not appended to: the upstream lines are taken
    verbatim from the file and the guard / redaction / outcome blocks are
    placed around them. That is what makes the patch idempotent -- a
    second run finds the same upstream lines and produces the same result,
    instead of accumulating a second guard.
    """
    # Remove everything a previous run wrote, so the rebuild starts from
    # the adapter's own upstream source.
    lines = _drop_all_markers(lines, path_name)

    # The FIRST version of this patcher could write the MAX assignment
    # twice, so an installed tree may hold more than one. Take the first
    # and drop the rest -- that is how an installed tree is NORMALISED
    # rather than refused.
    max_hits = [
        i for i, l in enumerate(lines)
        if l.strip() == "MAX_TEXT_INJECT_BYTES = 100 * 1024"
    ]
    if not max_hits:
        raise PatchError(
            f"{path_name}: the MAX_TEXT_INJECT_BYTES assignment was not found"
        )
    max_idx = max_hits[0]
    for extra in sorted(max_hits[1:], reverse=True):
        del lines[extra]

    decode_idx = _find_line(
        lines,
        lambda l: "text_content = raw_bytes.decode(" in l,
        "the raw_bytes decode",
        path_name,
    )
    except_idx = _find_line(
        lines,
        lambda l: l.strip().startswith("except UnicodeDecodeError:"),
        "the UnicodeDecodeError handler",
        path_name,
        start=decode_idx,
        end=min(len(lines), decode_idx + 80),
    )

    if_idx = max(
        i for i in range(max_idx, decode_idx)
        if lines[i].strip().startswith("if _is_text and len(raw_bytes) <= MAX_TEXT_INJECT_BYTES:")
    )
    try_idx = _find_line(
        lines,
        lambda l: l.strip() == "try:",
        "the decode try block",
        path_name,
        start=if_idx,
        end=decode_idx,
    )

    # The handler body: everything indented deeper than the `except` line.
    except_indent = _indent_of(lines[except_idx])
    handler_end = except_idx + 1
    while handler_end < len(lines):
        line = lines[handler_end]
        if not line.strip():
            handler_end += 1
            continue
        if _indent_of(line) <= except_indent:
            break
        handler_end += 1
    handler = lines[except_idx + 1:handler_end]

    # --- the parts we keep from the adapter's own source ---------------
    keep_is_text = lines[max_idx + 1:if_idx]
    keep_body = lines[try_idx:except_idx]

    # The first version of this patcher wrote a guard and a duplicated
    # MAX assignment. Remove them.
    keep_is_text = _drop_block(
        keep_is_text,
        lambda l: l.strip().startswith(LEGACY_GUARD_START),
        lambda l: l.strip() == "_is_text = False",
        "legacy secret-document guard",
        path_name,
    )
    keep_body = _drop_block(
        keep_body,
        lambda l: l.strip().startswith(LEGACY_REDACT_START),
        lambda l: "_redact_document_text(" in l,
        "legacy redaction",
        path_name,
    )
    keep_is_text = [
        l for l in keep_is_text
        if l.strip() != "MAX_TEXT_INJECT_BYTES = 100 * 1024"
        and not l.strip().startswith("if _is_text and len(raw_bytes)")
        and not l.strip().startswith("_doc_included = ")
        and not l.strip().startswith("_withheld_reason = ")
    ]
    keep_body = [
        l for l in keep_body
        if not l.strip().startswith("_doc_included = ")
    ]

    # --- assemble ------------------------------------------------------
    block_indent = _indent_of(lines[max_idx])
    body_indent = except_indent + 4
    decode_indent = _indent_of(lines[decode_idx])

    out: list[str] = []
    out.append(lines[max_idx])
    out.extend(keep_is_text)
    out.extend(_guard_block(spec, block_indent))
    out.append(" " * block_indent + "_doc_included = False")
    out.append(lines[if_idx])
    for line in keep_body:
        out.append(line)
        if "text_content = raw_bytes.decode(" in line:
            out.extend(_redact_block(spec, decode_indent))
    out.append(" " * body_indent + "_doc_included = True")
    out.append(lines[except_idx])
    out.extend(handler)
    out.extend(_outcome_record(
        block_indent,
        spec.path_expr,
        "_doc_included",
        '_withheld_reason or ("" if _doc_included else "it was too large, or could not be read as text")',
    ))

    return lines[:max_idx] + out + lines[handler_end:]


# ----------------------------------------------------------------------
# The WhatsApp region: it reads the file from disk and appends to `body`,
# so it has its own shape.
# ----------------------------------------------------------------------
def _rebuild_whatsapp_region(lines: list[str], spec: AdapterSpec,
                             path_name: str) -> list[str]:
    """Normalise WhatsApp's document block and record its outcome."""
    lines = _drop_all_markers(lines, path_name)

    # The first version of this patcher wrote the guard inline. Remove it.
    lines = _drop_block(
        lines,
        lambda l: l.strip().startswith(LEGACY_GUARD_START),
        lambda l: l.strip() == "continue",
        "legacy secret-document guard",
        path_name,
    )
    lines = _drop_block(
        lines,
        lambda l: l.strip().startswith(LEGACY_REDACT_START),
        lambda l: "_redact_document_text(" in l,
        "legacy redaction",
        path_name,
    )
    lines = [
        l for l in lines
        if not l.strip().startswith("_withheld_reason = ")
    ]

    read_idx = _find_line(
        lines,
        lambda l: "content = Path(doc_path).read_text(" in l,
        "the document read",
        path_name,
    )
    read_indent = _indent_of(lines[read_idx])

    skip_idx = _find_line(
        lines,
        lambda l: 'print(f"[{self.name}] Skipping text injection for {doc_path}' in l,
        "the size-skip notice",
        path_name,
    )
    injected_idx = _find_line(
        lines,
        lambda l: 'print(f"[{self.name}] Injected text content from: {doc_path}"' in l,
        "the injection notice",
        path_name,
    )
    failed_idx = _find_line(
        lines,
        lambda l: 'print(f"[{self.name}] Failed to read document text: {e}"' in l,
        "the read-failure notice",
        path_name,
    )

    guard = _guard_block(spec, read_indent)
    # The WhatsApp guard ends with `continue`, so the outcome must be
    # recorded BEFORE it -- otherwise it is unreachable code.
    continue_at = next(
        (i for i, l in enumerate(guard) if l.strip() == "continue"),
        None,
    )
    if continue_at is None:
        raise PatchError(f"{path_name}: the WhatsApp guard has no `continue`")
    guard = (
        guard[:continue_at]
        + _outcome_record(
            read_indent + 4,
            "doc_path",
            "False",
            '"it looks like it holds a secret"',
        )
        + guard[continue_at:]
    )

    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if i == read_idx:
            out.extend(guard)
            out.append(line)
            out.extend(_redact_block(spec, read_indent))
            i += 1
            continue
        if i == skip_idx:
            # The `continue` on the NEXT line ends this document, so the
            # outcome is recorded BEFORE it -- at the same indent as the
            # `continue`, which is one level deeper than the `if`.
            out.append(line)
            out.extend(_outcome_record(
                read_indent + 4,
                "doc_path",
                "False",
                '"it is too large to inline"',
            ))
            out.append(lines[i + 1])  # the `continue`
            i += 2
            continue
        out.append(line)
        if i == injected_idx:
            out.extend(_outcome_record(
                read_indent,
                "doc_path",
                "True",
                "None",
            ))
        elif i == failed_idx:
            out.extend(_outcome_record(
                read_indent,
                "doc_path",
                "False",
                '"it could not be read as text"',
            ))
        i += 1
    return out


# ----------------------------------------------------------------------
# The import patch.
#
# The helpers are defined in gateway/platforms/base.py, but the adapters
# call them as bare names. Without an import in the adapter's own
# namespace, the injection site raises NameError on EVERY text document
# -- which silently breaks document handling while the secret is never
# inlined.
#
# This is why the guard import must be added, and why the regression
# test checks the ADAPTER's namespace, not base.py's.
# ----------------------------------------------------------------------
def _patch_base_import(text: str, path_name: str, names: list[str]) -> tuple[str, list[str]]:
    """Ensure `names` are imported from gateway.platforms.base."""
    start = text.find("from gateway.platforms.base import (")
    if start < 0:
        raise PatchError(f"{path_name}: the gateway.platforms.base import block was not found")
    end = text.find("\n)", start)
    if end < 0:
        raise PatchError(f"{path_name}: the gateway.platforms.base import block is unterminated")
    block = text[start:end]
    missing = [n for n in names if f"\n    {n}," not in block]
    if not missing:
        return text, [f"OK    {path_name}: the helper imports are already present"]
    added = "".join(f"\n    {n}," for n in missing)
    text = text[:start] + block + added + text[end:]
    return text, [f"OK    {path_name}: imported {', '.join(missing)}"]


# ----------------------------------------------------------------------
# gateway/run.py: the truthful attachment note.
# ----------------------------------------------------------------------
RUN_NOTE_SIG_OLD = (
    "def _build_document_context_note(display_name: str, agent_path: str, mtype: str) -> str:"
)

RUN_NOTE_SIG_NEW = (
    "def _build_document_context_note(\n"
    "    display_name: str,\n"
    "    agent_path: str,\n"
    "    mtype: str,\n"
    "    outcome: Optional[Dict[str, Any]] = None,\n"
    ") -> str:"
)

RUN_NOTE_DOC_OLD = """    Text documents (``text/*``) have their content inlined upstream by the
    platform adapter, so the note just confirms that and records the path.
"""

RUN_NOTE_DOC_NEW = """    Text documents (``text/*``) are normally inlined upstream by the
    platform adapter -- but the adapter may withhold the content, for
    example when the document looks like it holds a secret. The adapter
    records what it actually did, and ``outcome`` carries that record:
    ``{"included": bool, "reason": str | None}``. The note must report
    the real outcome: claiming content was included when it was not
    sends the agent looking for text that is not in the turn.
"""

RUN_NOTE_TEXT_BRANCH_OLD = """    if mtype.startswith("text/"):
        return (
            f"[The user sent a text document: '{display_name}'. "
            f"Its content has been included below. "
            f"The file is also saved at: {agent_path}]"
        )
"""

RUN_NOTE_TEXT_BRANCH_NEW = """    if mtype.startswith("text/"):
        # The adapter is the component that decides whether a document's
        # content was inlined, so it recorded that decision and the note
        # reports it. Never claim the content was included when it was
        # not: the agent would look for text that is not there.
        if outcome is None:
            return (
                f"[The user sent a text document: '{display_name}'. "
                f"Its content was NOT confirmed as included here. "
                f"The file is saved at: {agent_path}. "
                f"If you need its contents, read them from that path with a tool.]"
            )
        if outcome.get("included"):
            return (
                f"[The user sent a text document: '{display_name}'. "
                f"Its content has been included below. "
                f"The file is also saved at: {agent_path}]"
            )
        _reason = str(outcome.get("reason") or "").strip() or "it was withheld"
        return (
            f"[The user sent a text document: '{display_name}'. "
            f"Its content was NOT included here -- {_reason}. "
            f"The file is saved at: {agent_path}. "
            f"If you need its contents, read them from that path with a tool.]"
        )
"""

RUN_CALL_OLD = (
    "                context_note = _build_document_context_note(display_name, agent_path, mtype)"
)

RUN_CALL_NEW = (
    "                _doc_outcome = document_outcome(getattr(event, \"metadata\", None), path)\n"
    "                context_note = _build_document_context_note(\n"
    "                    display_name, agent_path, mtype, _doc_outcome\n"
    "                )"
)


def _patch_run_note(text: str, path_name: str) -> tuple[str, list[str]]:
    """Make the attachment note report the adapter's real decision."""
    notes: list[str] = []

    # 1. the import of document_outcome
    text, import_notes = _patch_base_import(text, path_name, ["document_outcome"])
    notes += import_notes

    # 2. the signature
    if RUN_NOTE_SIG_NEW in text:
        notes.append(f"SKIP  {path_name}: the note builder already takes an outcome")
    elif RUN_NOTE_SIG_OLD in text:
        text = text.replace(RUN_NOTE_SIG_OLD, RUN_NOTE_SIG_NEW, 1)
        notes.append(f"OK    {path_name}: the note builder takes an outcome")
    else:
        raise PatchError(f"{path_name}: the note builder signature was not found")

    # 3. the docstring
    if RUN_NOTE_DOC_NEW in text:
        pass
    elif RUN_NOTE_DOC_OLD in text:
        text = text.replace(RUN_NOTE_DOC_OLD, RUN_NOTE_DOC_NEW, 1)
        notes.append(f"OK    {path_name}: the note builder docstring explains the outcome")
    else:
        raise PatchError(f"{path_name}: the note builder docstring was not found")

    # 4. the text branch
    if RUN_NOTE_TEXT_BRANCH_NEW in text:
        notes.append(f"SKIP  {path_name}: the truthful text branch is already present")
    elif RUN_NOTE_TEXT_BRANCH_OLD in text:
        text = text.replace(RUN_NOTE_TEXT_BRANCH_OLD, RUN_NOTE_TEXT_BRANCH_NEW, 1)
        notes.append(f"OK    {path_name}: the note now reports the real outcome")
    else:
        raise PatchError(f"{path_name}: the note builder's text branch was not found")

    # 5. the call site
    if RUN_CALL_NEW in text:
        notes.append(f"SKIP  {path_name}: the call site already passes the outcome")
    elif RUN_CALL_OLD in text:
        text = text.replace(RUN_CALL_OLD, RUN_CALL_NEW, 1)
        notes.append(f"OK    {path_name}: the call site passes the recorded outcome")
    else:
        raise PatchError(f"{path_name}: the note builder call site was not found")

    return text, notes


# ----------------------------------------------------------------------
# The per-adapter plumbing: give each adapter a place to record the
# outcome, and carry it onto the MessageEvent.
# ----------------------------------------------------------------------
def _discord_plumbing(text: str, path_name: str) -> tuple[str, list[str]]:
    """Discord builds the event after the document loop."""
    notes: list[str] = []
    decl_old = "        pending_text_injection: Optional[str] = None\n"
    decl_new = decl_old + f"        {OUTCOME_MAP_DECL}\n"
    if f"        {OUTCOME_MAP_DECL}\n" in text:
        notes.append(f"SKIP  {path_name}: the outcome dict is already declared")
    elif decl_old in text:
        text = text.replace(decl_old, decl_new, 1)
        notes.append(f"OK    {path_name}: declared the outcome dict")
    else:
        raise PatchError(f"{path_name}: the pending_text_injection declaration was not found")

    ctor_old = "            media_urls=media_urls,\n            media_types=media_types,\n"
    ctor_new = ctor_old + "            metadata=document_outcomes_metadata(document_outcomes),\n"
    if "            metadata=document_outcomes_metadata(document_outcomes),\n" in text:
        notes.append(f"SKIP  {path_name}: the event already carries the outcome")
    elif ctor_old in text:
        text = text.replace(ctor_old, ctor_new, 1)
        notes.append(f"OK    {path_name}: the event carries the outcome")
    else:
        raise PatchError(f"{path_name}: the MessageEvent constructor was not found")

    return text, notes


def _slack_plumbing(text: str, path_name: str) -> tuple[str, list[str]]:
    """Slack builds the event after the document loop."""
    notes: list[str] = []
    decl_old = '        files = event.get("files", [])\n'
    decl_new = f"        {OUTCOME_MAP_DECL}\n" + decl_old
    if f"        {OUTCOME_MAP_DECL}\n" in text:
        notes.append(f"SKIP  {path_name}: the outcome dict is already declared")
    elif decl_old in text:
        text = text.replace(decl_old, decl_new, 1)
        notes.append(f"OK    {path_name}: declared the outcome dict")
    else:
        raise PatchError(f"{path_name}: the files loop was not found")

    meta_old = '                "slack_thread_ts": thread_ts,\n'
    meta_new = meta_old + "                **document_outcomes_metadata(document_outcomes),\n"
    if "                **document_outcomes_metadata(document_outcomes),\n" in text:
        notes.append(f"SKIP  {path_name}: the event already carries the outcome")
    elif meta_old in text:
        text = text.replace(meta_old, meta_new, 1)
        notes.append(f"OK    {path_name}: the event carries the outcome")
    else:
        raise PatchError(f"{path_name}: the MessageEvent metadata block was not found")

    return text, notes


def _telegram_plumbing(text: str, path_name: str) -> tuple[str, list[str]]:
    """Telegram creates the event BEFORE the document is handled.

    So the outcome map is declared next to the event, filled in by the
    document block, and committed onto the event's metadata just before
    the event is dispatched.
    """
    notes: list[str] = []
    decl_old = "        msg_type = self._media_message_type(msg)\n"
    decl_new = decl_old + f"        {OUTCOME_MAP_DECL}\n"
    if f"        {OUTCOME_MAP_DECL}\n" in text:
        notes.append(f"SKIP  {path_name}: the outcome dict is already declared")
    elif decl_old in text:
        text = text.replace(decl_old, decl_new, 1)
        notes.append(f"OK    {path_name}: declared the outcome dict")
    else:
        raise PatchError(f"{path_name}: the media message type line was not found")

    # The event is dispatched at the end of the handler. The outcomes must
    # be on the event by then.
    commit_old = """        media_group_id = getattr(msg, "media_group_id", None)
"""
    commit_new = (
        "        # SECRET-DOCUMENT OUTCOME (added by\n"
        "        # scripts/hermes/patch-gateway-secret-documents.py): publish what\n"
        "        # the adapter actually did, so the attachment note can report the\n"
        "        # real outcome instead of guessing from the MIME type.\n"
        "        event.metadata.update(document_outcomes_metadata(document_outcomes))\n"
        + commit_old
    )
    if "        event.metadata.update(document_outcomes_metadata(document_outcomes))\n" in text:
        notes.append(f"SKIP  {path_name}: the outcome is already committed to the event")
    elif commit_old in text:
        text = text.replace(commit_old, commit_new, 1)
        notes.append(f"OK    {path_name}: the outcome is committed to the event")
    else:
        raise PatchError(f"{path_name}: the Telegram dispatch point was not found")

    return text, notes


def _feishu_plumbing(text: str, path_name: str) -> tuple[str, list[str]]:
    """Feishu's helper returns the injected text, so it returns the reason too.

    The helper is REBUILT, not appended to: the whole function is
    replaced with the canonical form. That is what makes the patch
    idempotent, and it is what lets an ALREADY-PATCHED installed tree --
    written by an earlier version of this patcher, with no markers -- be
    normalised instead of refused.
    """
    notes: list[str] = []

    # 1. the helper returns (text, reason)
    helper_old = """    async def _maybe_extract_text_document(self, cached_path: str, media_type: str) -> str:
        if not cached_path or not media_type.startswith("text/"):
            return ""
        try:
            if os.path.getsize(cached_path) > _MAX_TEXT_INJECT_BYTES:
                return ""
            ext = Path(cached_path).suffix.lower()
            if ext not in {".txt", ".md"} and media_type not in {"text/plain", "text/markdown"}:
                return ""
"""
    helper_new = """    async def _maybe_extract_text_document(self, cached_path: str, media_type: str) -> tuple:
        # Returns (injected_text, withheld_reason). The reason is empty when
        # the content was inlined, and otherwise explains why it was not --
        # the attachment note reports it.
        if not cached_path or not media_type.startswith("text/"):
            return "", ""
        try:
            if os.path.getsize(cached_path) > _MAX_TEXT_INJECT_BYTES:
                return "", "it is too large to inline"
            ext = Path(cached_path).suffix.lower()
            if ext not in {".txt", ".md"} and media_type not in {"text/plain", "text/markdown"}:
                return "", ""
"""
    if 'async def _maybe_extract_text_document(self, cached_path: str, media_type: str) -> tuple:' in text:
        notes.append(f"SKIP  {path_name}: the helper already returns a reason")
    elif helper_old in text:
        text = text.replace(helper_old, helper_new, 1)
        notes.append(f"OK    {path_name}: the helper returns a reason")
    else:
        raise PatchError(f"{path_name}: the _maybe_extract_text_document header was not found")

    # 2. the body: the guard, the redaction and the two returns.
    #
    # The body is REBUILT. Three shapes must be recognised:
    #   - the upstream body (no guard, no redaction);
    #   - the body an EARLIER version of this patcher wrote (a guard and
    #     a redaction, but with no markers and a single return value);
    #   - the canonical body (with markers).
    # The whole function is located by its boundaries, so any of the
    # three is replaced by the canonical one.
    lines = text.splitlines()
    start = None
    for i, l in enumerate(lines):
        if l.startswith("    async def _maybe_extract_text_document(self"):
            start = i
            break
    if start is None:
        raise PatchError(f"{path_name}: the _maybe_extract_text_document header was not found")
    end = None
    for i in range(start + 1, len(lines)):
        if lines[i].startswith("    async def ") or lines[i].startswith("    def "):
            end = i
            break
    if end is None:
        raise PatchError(f"{path_name}: the end of _maybe_extract_text_document was not found")

    body_new = """            # hermes:secret-document-guard:begin
            # SECRET-DOCUMENT GUARD (added by
            # scripts/hermes/patch-gateway-secret-documents.py): a document
            # that holds a secret is NEVER inlined. The agent gets the
            # cached path and reads it with a tool; the bytes must not enter
            # the user turn, because the user turn goes to the model
            # provider verbatim.
            if _is_secret_shaped_document(cached_path, "", media_type):
                logger.info(
                    "[Feishu] Document %s looks secret-shaped; NOT inlining "
                    "(path only)",
                    cached_path,
                )
                return "", "it looks like it holds a secret"
            # hermes:secret-document-guard:end
            content = Path(cached_path).read_text(encoding="utf-8")
            # hermes:secret-document-redact:begin
            # SECRET-DOCUMENT REDACTION (defence in depth, added by
            # scripts/hermes/patch-gateway-secret-documents.py): even an
            # ordinary-looking document is redacted before it is inlined, so
            # one key in a file of prose does not leak.
            content = _redact_document_text(content)
            # hermes:secret-document-redact:end
            display_name = self._display_name_from_cached_path(cached_path)
            return f"[Content of {display_name}]:\\n{content}", ""
        except (OSError, UnicodeDecodeError):
            logger.warning("[Feishu] Failed to inject text document content from %s", cached_path, exc_info=True)
            return "", "it could not be read as text"
"""
    lines = lines[:start] + (helper_new + body_new).splitlines() + lines[end:]
    text = "\n".join(lines) + "\n"
    notes.append(f"OK    {path_name}: the secret branch returns a reason")

    # 2. the caller records the outcome
    call_old = """            injected = await self._maybe_extract_text_document(media_urls[0], media_types[0])
            if injected:
                text = injected
"""
    call_new = """            injected, _withheld_reason = await self._maybe_extract_text_document(
                media_urls[0], media_types[0]
            )
            if injected:
                text = injected
                record_document_outcome(
                    document_outcomes, media_urls[0], included=True
                )
            else:
                record_document_outcome(
                    document_outcomes,
                    media_urls[0],
                    included=False,
                    reason=_withheld_reason,
                )
"""
    if "record_document_outcome(\n                    document_outcomes," in text:
        notes.append(f"SKIP  {path_name}: the caller already records the outcome")
    elif call_old in text:
        text = text.replace(call_old, call_new, 1)
        notes.append(f"OK    {path_name}: the caller records the outcome")
    else:
        raise PatchError(f"{path_name}: the Feishu call site was not found")

    # 3. the helper returns the outcome dict
    ret_old = "        return text, inbound_type, media_urls, media_types, list(normalized.mentions)\n"
    ret_new = (
        "        return (\n"
        "            text, inbound_type, media_urls, media_types,\n"
        "            list(normalized.mentions), document_outcomes,\n"
        "        )\n"
    )
    if "list(normalized.mentions), document_outcomes," in text:
        notes.append(f"SKIP  {path_name}: the outcome dict is already returned")
    elif ret_old in text:
        text = text.replace(ret_old, ret_new, 1)
        notes.append(f"OK    {path_name}: the helper returns the outcome dict")
    else:
        raise PatchError(f"{path_name}: the Feishu helper return was not found")

    # 3a. the outcome map must exist BEFORE the call site uses it, so it
    #     is declared at the top of the function.
    decl_old = """    ) -> tuple[str, MessageType, List[str], List[str], List[FeishuMentionRef]]:
        raw_content = getattr(message, "content", "") or ""
"""
    decl_new = """    ) -> tuple:
        # document_outcomes records, per cached document, whether its
        # content was actually inlined. The attachment note is built from
        # it, so it must reflect the adapter's real decision.
        document_outcomes: Dict[str, Any] = {}
        raw_content = getattr(message, "content", "") or ""
"""
    if "        document_outcomes: Dict[str, Any] = {}\n        raw_content = " in text:
        notes.append(f"SKIP  {path_name}: the outcome map is already declared")
    elif decl_old in text:
        text = text.replace(decl_old, decl_new, 1)
        notes.append(f"OK    {path_name}: declared the outcome map")
    else:
        raise PatchError(f"{path_name}: the Feishu helper header was not found")

    # 4. the caller unpacks it and puts it on the event
    unpack_old = "        text, inbound_type, media_urls, media_types, mentions = await self._extract_message_content(message)\n"
    unpack_new = (
        "        text, inbound_type, media_urls, media_types, mentions, document_outcomes = (\n"
        "            await self._extract_message_content(message)\n"
        "        )\n"
    )
    if "mentions, document_outcomes = (" in text:
        notes.append(f"SKIP  {path_name}: the outcome dict is already unpacked")
    elif unpack_old in text:
        text = text.replace(unpack_old, unpack_new, 1)
        notes.append(f"OK    {path_name}: the outcome dict is unpacked")
    else:
        raise PatchError(f"{path_name}: the Feishu unpack site was not found")

    ctor_old = "            channel_prompt=self._resolve_channel_prompt(chat_id, thread_id or None),\n"
    ctor_new = ctor_old + "            metadata=document_outcomes_metadata(document_outcomes),\n"
    if "            metadata=document_outcomes_metadata(document_outcomes),\n" in text:
        notes.append(f"SKIP  {path_name}: the event already carries the outcome")
    elif ctor_old in text:
        text = text.replace(ctor_old, ctor_new, 1)
        notes.append(f"OK    {path_name}: the event carries the outcome")
    else:
        raise PatchError(f"{path_name}: the Feishu MessageEvent constructor was not found")

    return text, notes


def _whatsapp_plumbing(text: str, path_name: str) -> tuple[str, list[str]]:
    """WhatsApp builds the event after the document loop."""
    notes: list[str] = []
    decl_old = "            MAX_TEXT_INJECT_BYTES = 100 * 1024\n"
    decl_new = f"            {OUTCOME_MAP_DECL}\n" + decl_old
    if f"            {OUTCOME_MAP_DECL}\n" in text:
        notes.append(f"SKIP  {path_name}: the outcome dict is already declared")
    elif decl_old in text:
        text = text.replace(decl_old, decl_new, 1)
        notes.append(f"OK    {path_name}: declared the outcome dict")
    else:
        raise PatchError(f"{path_name}: the WhatsApp MAX_TEXT_INJECT_BYTES line was not found")

    meta_old = "            metadata: Dict[str, Any] = {}\n"
    meta_new = meta_old + "            metadata.update(document_outcomes_metadata(document_outcomes))\n"
    if "            metadata.update(document_outcomes_metadata(document_outcomes))\n" in text:
        notes.append(f"SKIP  {path_name}: the event already carries the outcome")
    elif meta_old in text:
        text = text.replace(meta_old, meta_new, 1)
        notes.append(f"OK    {path_name}: the event carries the outcome")
    else:
        raise PatchError(f"{path_name}: the WhatsApp metadata declaration was not found")

    return text, notes


# ----------------------------------------------------------------------
# The base.py transformations.
# ----------------------------------------------------------------------
def _patch_base(text: str, path_name: str) -> tuple[str, list[str]]:
    """base.py: the 0600 cache mode, the helper, and the outcome channel."""
    notes: list[str] = []

    # 1. the cache mode
    for func_name, old in CACHE_FUNCS:
        start = text.find(f"def {func_name}(")
        if start == -1:
            raise PatchError(f"{path_name}: {func_name} not found")
        end = text.find("\ndef ", start + 1)
        if end == -1:
            end = len(text)
        body = text[start:end]
        if old not in body:
            if "os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600" in body:
                notes.append(f"SKIP  {path_name}: {func_name} already writes 0600")
                continue
            raise PatchError(f"{path_name}: {func_name} pattern not found")
        text = text[:start] + body.replace(old, BASE_NEW, 1) + text[end:]
        notes.append(f"OK    {path_name}: {func_name} now writes 0600")

    # 2. the secret-document helper
    if "_is_secret_shaped_document" in text:
        notes.append(f"SKIP  {path_name}: the secret-document helper is already present")
    else:
        text += HELPER
        notes.append(f"OK    {path_name}: appended the secret-document helper")

    # 3. the outcome channel
    if "DOCUMENT_OUTCOMES_KEY" in text:
        notes.append(f"SKIP  {path_name}: the outcome channel is already present")
    else:
        text += OUTCOME_HELPER
        notes.append(f"OK    {path_name}: appended the document-outcome channel")

    # 4. the pending-event merge must carry the outcomes
    merge_old = """        if existing_is_photo and incoming_is_photo:
            existing.media_urls.extend(event.media_urls)
            existing.media_types.extend(event.media_types)
"""
    merge_new = merge_old + "            merge_document_outcomes(existing, event)\n"
    media_old = """        if existing_has_media or incoming_has_media:
            if incoming_has_media:
                existing.media_urls.extend(event.media_urls)
                existing.media_types.extend(event.media_types)
"""
    media_new = media_old + "            merge_document_outcomes(existing, event)\n"
    if text.count("merge_document_outcomes(existing, event)") >= 2:
        notes.append(f"SKIP  {path_name}: the pending-event merge already carries the outcomes")
    elif merge_old in text and media_old in text:
        text = text.replace(merge_old, merge_new, 1)
        text = text.replace(media_old, media_new, 1)
        notes.append(f"OK    {path_name}: the pending-event merge carries the outcomes")
    else:
        raise PatchError(f"{path_name}: the pending-event merge was not found")

    return text, notes


# ----------------------------------------------------------------------
# The main flow.
# ----------------------------------------------------------------------
def _read(path: Path) -> str:
    if not path.exists():
        raise PatchError(f"{path.name}: not found")
    return path.read_text()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--pkg-root",
        default=str(DEFAULT_PKG),
        help="the site-packages tree to patch (default: the installed gateway)",
    )
    args = ap.parse_args()

    pkg = Path(args.pkg_root)
    base_path = pkg / "gateway/platforms/base.py"
    run_path = pkg / "gateway/run.py"

    print(f"=== patching the Hermes gateway (dry-run={args.dry_run}) ===")
    print(f"    tree: {pkg}\n")

    all_notes: list[str] = []

    # Every transformation is computed in memory first. Nothing is written
    # unless every one of them succeeded: a half-patched tree is worse
    # than an unpatched one.
    writes: list[tuple[Path, str]] = []

    try:
        # --- base.py -------------------------------------------------
        base_text, notes = _patch_base(_read(base_path), base_path.name)
        all_notes += notes
        writes.append((base_path, base_text))

        # --- the decode-style adapters --------------------------------
        for spec in DECODE_SPECS:
            path = pkg / spec.rel
            text = _read(path)
            path_name = path.name

            text, notes = _patch_base_import(text, path_name, ADAPTER_HELPERS)
            all_notes += notes

            lines = text.splitlines()
            rebuilt = _rebuild_decode_region(lines, spec, path_name)
            new_text = "\n".join(rebuilt) + "\n"
            if new_text == text:
                all_notes.append(f"SKIP  {path_name}: the injection site is already correct")
            else:
                all_notes.append(f"OK    {path_name}: rebuilt the injection site")
            text = new_text

            if spec.label == "discord":
                text, notes = _discord_plumbing(text, path_name)
            elif spec.label == "slack":
                text, notes = _slack_plumbing(text, path_name)
            elif spec.label == "telegram":
                text, notes = _telegram_plumbing(text, path_name)

            all_notes += notes
            writes.append((path, text))

        # --- WhatsApp -------------------------------------------------
        wa_spec = AdapterSpec(
            label="whatsapp",
            rel="plugins/platforms/whatsapp/adapter.py",
            path_expr="doc_path",
            name_expr='""',
            mime_expr='""',
            log_name_expr="doc_path",
            log_prefix="WhatsApp",
            log_style="print",
            redact_var="content",
            uses_is_text=False,
        )
        wa_path = pkg / wa_spec.rel
        wa_text = _read(wa_path)
        wa_text, notes = _patch_base_import(wa_text, wa_path.name, ADAPTER_HELPERS)
        all_notes += notes
        wa_lines = wa_text.splitlines()
        wa_new = "\n".join(_rebuild_whatsapp_region(wa_lines, wa_spec, wa_path.name)) + "\n"
        if wa_new == wa_text:
            all_notes.append(f"SKIP  {wa_path.name}: the injection site is already correct")
        else:
            all_notes.append(f"OK    {wa_path.name}: rebuilt the injection site")
        wa_text = wa_new
        wa_text, notes = _whatsapp_plumbing(wa_text, wa_path.name)
        all_notes += notes
        writes.append((wa_path, wa_text))

        # --- Feishu ----------------------------------------------------
        feishu_path = pkg / "plugins/platforms/feishu/adapter.py"
        feishu_text = _read(feishu_path)
        feishu_text, notes = _patch_base_import(feishu_text, feishu_path.name, ADAPTER_HELPERS)
        all_notes += notes
        feishu_text, notes = _feishu_plumbing(feishu_text, feishu_path.name)
        all_notes += notes
        writes.append((feishu_path, feishu_text))

        # --- gateway/run.py ---------------------------------------------
        run_text = _read(run_path)
        run_text, notes = _patch_run_note(run_text, run_path.name)
        all_notes += notes
        writes.append((run_path, run_text))

    except PatchError as exc:
        print("\n".join(all_notes))
        print()
        print(f"FAILED: {exc}")
        print("Nothing was written.")
        return 1

    # --- verify the result compiles before writing it -----------------
    import py_compile
    import tempfile

    with tempfile.TemporaryDirectory(prefix="hermes-patch-check-") as tmp:
        for path, text in writes:
            check_path = Path(tmp) / path.name
            check_path.write_text(text)
            try:
                py_compile.compile(str(check_path), doraise=True)
            except py_compile.PyCompileError as exc:
                print("\n".join(all_notes))
                print()
                print(f"FAILED: the patched {path.name} does not compile: {exc}")
                print("Nothing was written.")
                return 1

    if args.dry_run:
        print("\n".join(all_notes))
        print()
        print("DRY RUN -- nothing was written")
        return 0

    for path, text in writes:
        backup = path.with_suffix(path.suffix + ".orig")
        if not backup.exists():
            shutil.copy2(path, backup)
        path.write_text(text)

    print("\n".join(all_notes))
    print()
    print("PATCHED. Backups: <file>.orig")
    return 0


if __name__ == "__main__":
    sys.exit(main())
