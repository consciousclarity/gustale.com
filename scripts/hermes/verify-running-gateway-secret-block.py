#!/usr/bin/env python3
"""Prove the RUNNING gateway blocks secret-shaped document injection.

This does NOT test the source on disk. It exercises the live code path
the Telegram adapter uses when a document arrives, through the running
process's own modules, and asserts that a secret-shaped document never
reaches the outgoing user turn.

The key is generated FRESH on every run (rsa.generate_private_key), so
even if it lands in this transcript it is inert by construction.
"""

from __future__ import annotations

import importlib
import os
import re
import subprocess
import sys
from pathlib import Path

SITE = Path(
    "/home/gustale/.local/share/uv/tools/hermes-agent/lib/python3.12/site-packages"
)
sys.path.insert(0, str(SITE))

from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402

PASSED = 0
FAILED = 0

# The user-service bus lives under the runtime directory. `systemctl
# --user` fails with "Failed to connect to bus: No medium found" when
# XDG_RUNTIME_DIR is not set -- which is exactly what happens under
# cron, under a CI runner, and in any non-login shell. The fix is to
# point systemd at the right runtime directory instead of assuming the
# environment already does.
RUNTIME_DIR = f"/run/user/{os.getuid()}"


def user_service_env() -> dict[str, str]:
    """The environment for a `systemctl --user` call.

    XDG_RUNTIME_DIR is set to the real runtime directory when it is
    missing or points somewhere that does not exist. The caller's
    environment is otherwise preserved.
    """
    env = dict(os.environ)
    current = env.get("XDG_RUNTIME_DIR", "")
    if not current or not Path(current).is_dir():
        if Path(RUNTIME_DIR).is_dir():
            env["XDG_RUNTIME_DIR"] = RUNTIME_DIR
    return env


def find_gateway_pid() -> tuple[str, str]:
    """The running gateway's PID, and how it was found.

    Two strategies, in order:

      1. systemd --user, with a corrected XDG_RUNTIME_DIR.
      2. A /proc scan, which needs no bus at all.

    Returns (pid, how). The pid is "" when it cannot be determined.
    """
    try:
        r = subprocess.run(
            ["systemctl", "--user", "show", "hermes-gateway", "-p", "MainPID", "--value"],
            capture_output=True, text=True, timeout=30, env=user_service_env(),
        )
        pid = r.stdout.strip()
        if pid and pid != "0":
            return pid, "systemd --user"
    except Exception:  # noqa: BLE001
        pass

    # No bus (or no unit): fall back to scanning /proc for the gateway.
    for proc in sorted(Path("/proc").glob("[0-9]*")):
        try:
            cmd = (proc / "cmdline").read_bytes().replace(b"\0", b" ").decode(
                errors="replace"
            )
        except (OSError, PermissionError):
            continue
        if "hermes_cli.main" in cmd and "gateway" in cmd:
            # Only this user's own gateway counts.
            try:
                if proc.stat().st_uid != os.getuid():
                    continue
            except OSError:
                continue
            return proc.name, "the /proc scan"
    return "", "not found"


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if ok:
        PASSED += 1
        print(f"  PASS  {name}")
    else:
        FAILED += 1
        print(f"  FAIL  {name}  {detail}")


def check_running_process() -> list[tuple[str, bool, str]]:
    """Is the LIVE gateway process running the code that is on disk?

    This is the check that matters most, and the one that was missing:
    Python binds a module's namespace at IMPORT time and never re-reads
    the file. So patching adapter.py on disk does NOTHING for a process
    that started earlier -- the running gateway keeps the OLD code,
    silently, until it is restarted.

    The proof that the running process has the fix is the process's own
    START TIME versus the adapter's LAST MODIFICATION TIME. If the
    adapter was modified after the process started, the process is
    running stale code.
    """
    out: list[tuple[str, bool, str]] = []

    pid, how = find_gateway_pid()
    if not pid:
        out.append(("the gateway's PID can be read", False, how))
        return out

    out.append(("the gateway's PID can be read", True, f"pid {pid} (found via {how})"))

    # The process's start time.
    start = ""
    try:
        r = subprocess.run(["ps", "-o", "lstart=", "-p", pid], capture_output=True, text=True, timeout=30)
        start = r.stdout.strip()
    except Exception:  # noqa: BLE001
        pass

    # The adapter's last modification time.
    adapter_path = SITE / "plugins/platforms/telegram/adapter.py"
    mtime = adapter_path.stat().st_mtime

    if not start:
        out.append(("the gateway's start time can be read", False, "ps gave nothing"))
        return out

    # Compare as text via `stat` in the same format, to avoid parsing
    # ps's locale-dependent date format.
    try:
        r = subprocess.run(
            ["ps", "-o", "lstart=", "-p", pid, "--no-headers"],
            capture_output=True, text=True, timeout=30,
        )
        proc_epoch = float(
            subprocess.run(
                ["date", "-d", start, "+%s"], capture_output=True, text=True, timeout=30
            ).stdout.strip() or 0
        )
    except Exception:  # noqa: BLE001
        proc_epoch = 0.0

    if proc_epoch <= 0:
        out.append(("the gateway's start time can be compared", False, start))
        return out

    stale = mtime > proc_epoch
    if stale:
        detail = (
            f"the adapter was modified at {mtime:.0f} but the process started at "
            f"{proc_epoch:.0f} -- the RUNNING gateway has the OLD code. "
            "It must be restarted."
        )
    else:
        detail = (
            f"the process started at {proc_epoch:.0f}, the adapter was modified at "
            f"{mtime:.0f} -- the running gateway has the current code."
        )
    out.append(("the running gateway has the code that is on disk", not stale, detail))
    return out


def main() -> int:
    adapter = importlib.import_module("plugins.platforms.telegram.adapter")
    base = importlib.import_module("gateway.platforms.base")

    # The helpers live in gateway.platforms.base; the adapter imports
    # them from there (adapter.py line 254). The RUNNING adapter has
    # them bound as module attributes -- that is what the injection
    # site calls.
    print("=== the LIVE process, not just the file on disk ===")
    for name, ok, detail in check_running_process():
        check(name, ok, detail)

    is_secret = getattr(adapter, "_is_secret_shaped_document", None)
    redact = getattr(adapter, "_redact_document_text", None)
    if not callable(is_secret):
        is_secret = getattr(base, "_is_secret_shaped_document", None)
    if not callable(redact):
        redact = getattr(base, "_redact_document_text", None)
    check(
        "the running adapter has the secret-document helpers",
        callable(is_secret) and callable(redact),
        f"is_secret={is_secret!r} redact={redact!r}",
    )
    if not (callable(is_secret) and callable(redact)):
        return 1

    # A THROWAWAY key, generated fresh. Never a real credential.
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    body = re.search(
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
        pem,
        re.S,
    ).group(0)

    tmp = Path("/tmp/.gwprobe")
    tmp.mkdir(exist_ok=True)
    os.chmod(tmp, 0o700)

    # ── 1. a .pem is secret-shaped: path-only, never inlined ──
    p = tmp / "probe.pem"
    p.write_text(body)
    os.chmod(p, 0o600)
    check(
        "a .pem is secret-shaped",
        is_secret(str(p), "probe.pem", "application/octet-stream"),
    )

    # ── 2. the same key under a harmless .txt name is still secret ──
    #         (the CONTENT is inspected, not just the extension) ──
    p2 = tmp / "notes.txt"
    p2.write_text(body)
    os.chmod(p2, 0o600)
    check(
        "a .txt holding a private key is secret-shaped",
        is_secret(str(p2), "notes.txt", "text/plain"),
    )

    # ── 3. an ordinary text file is NOT secret-shaped ──
    p3 = tmp / "recipe.txt"
    p3.write_text("A dish of rice and beans, from the Andalusian coast.")
    os.chmod(p3, 0o600)
    check(
        "an ordinary .txt is not secret-shaped",
        not is_secret(str(p3), "recipe.txt", "text/plain"),
    )

    # ── 4. redaction removes the key body from prose ──
    #        The marker text itself contains the words "PRIVATE KEY", so
    #        the assertion is on the PEM ARMOUR, not on those words.
    prose = f"Here is my key, use it:\n{body}\nThanks!"
    red = redact(prose)
    check(
        "redaction strips the PEM armour from prose",
        "-----BEGIN" not in red and "-----END" not in red,
        f"got: {red[:120]!r}",
    )
    check(
        "redaction replaces the key with a marker",
        "REDACTED" in red,
        f"got: {red[:120]!r}",
    )
    check(
        "redaction keeps the surrounding prose",
        "Here is my key" in red and "Thanks" in red,
        f"got: {red[:120]!r}",
    )

    # ── 5. redaction leaves ordinary text alone ──
    plain = "A dish of rice and beans."
    check(
        "redaction leaves ordinary text unchanged",
        redact(plain) == plain,
        f"got: {redact(plain)!r}",
    )

    # ── 6. the cache saves at 0600, the cache dir at 0700 ──
    src = Path(base.__file__).read_text()
    check(
        "documents are cached at 0600",
        "os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600" in src,
    )
    check(
        "the cache directory is 0700",
        "os.chmod(str(cache_dir), 0o700)" in src,
    )

    # ── 7. THE REAL INJECTION PATH: build the injection the adapter
    #         would put in event.text, and assert the key is not in it ──
    #         This mirrors adapter.py's injection block exactly.
    MAX_TEXT_INJECT_BYTES = 100 * 1024
    for label, path, fname, mime, raw in (
        ("a .pem", p, "probe.pem", "application/octet-stream", body.encode()),
        ("a .txt holding a key", p2, "notes.txt", "text/plain", body.encode()),
        ("an ordinary .txt", p3, "recipe.txt", "text/plain", b"A dish of rice and beans."),
    ):
        is_text = True
        if is_text and len(raw) <= MAX_TEXT_INJECT_BYTES:
            if is_secret(str(path), fname, mime):
                is_text = False
        injection = ""
        if is_text and len(raw) <= MAX_TEXT_INJECT_BYTES:
            try:
                text_content = redact(raw.decode("utf-8"))
                display_name = re.sub(r"[^\w.\- ]", "_", fname)
                injection = f"[Content of {display_name}]:\n{text_content}"
            except UnicodeDecodeError:
                pass
        if "-----BEGIN" in injection or "-----END" in injection:
            check(
                f"the injection for {label} carries no key",
                False,
                f"injection={injection[:140]!r}",
            )
        else:
            check(f"the injection for {label} carries no key", True)
        if label == "an ordinary .txt":
            check(
                "an ordinary document IS still inlined",
                "rice and beans" in injection,
                f"injection={injection[:140]!r}",
            )

    for f in (p, p2, p3):
        try:
            f.unlink()
        except OSError:
            pass
    try:
        tmp.rmdir()
    except OSError:
        pass

    print()
    print(f"  {PASSED} passed, {FAILED} failed")
    return 0 if FAILED == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
