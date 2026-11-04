#!/usr/bin/env python3
"""Test the gateway secret-document fix with a THROWAWAY key.

The test never uses a real credential. It generates a throwaway RSA key in
memory, writes it to a temp file, and asserts that:

  1. A secret-shaped document is NOT inlined -- the path is surfaced instead.
  2. An ordinary document IS inlined, but redacted if it contains a key.
  3. A cached document is written at mode 0600, not 0664.
  4. A secret-looking file with a HARMLESS name/extension is still caught
     (the content check).

Run:
    python3 scripts/hermes/test-gateway-secret-documents.py
"""
from __future__ import annotations

import os
import stat
import sys
import tempfile
from pathlib import Path

sys.path.insert(
    0,
    "/home/gustale/.local/share/uv/tools/hermes-agent/lib/python3.12/site-packages",
)

PASS, FAIL = "PASS", "FAIL"
results: list[tuple[str, str, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((name, PASS if condition else FAIL, detail))
    print(f"  [{PASS if condition else FAIL}] {name}" + (f" -- {detail}" if detail else ""))


def make_throwaway_key() -> str:
    """A throwaway RSA key, generated fresh. NOT a credential."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return pem.decode()


def main() -> int:
    from gateway.platforms import base as gbase

    print("=== 0. the helper exists and is importable ===")
    check("_is_secret_shaped_document exists", hasattr(gbase, "_is_secret_shaped_document"))
    check("_redact_document_text exists", hasattr(gbase, "_redact_document_text"))
    if not hasattr(gbase, "_is_secret_shaped_document"):
        print("\nABORT: the helper is not in place")
        return 1

    # The helper living in base.py is NOT ENOUGH. The Telegram adapter
    # calls these names bare, inside its own module namespace. If the
    # adapter does not import them, the injection site raises NameError
    # on EVERY text document -- the secret is never inlined, and document
    # handling is silently broken.
    #
    # This check is the one that would have caught it.
    print("\n=== 0b. the Telegram adapter can RESOLVE the helper names ===")
    try:
        from plugins.platforms.telegram import adapter as tadapter
    except Exception as exc:  # noqa: BLE001
        check("the Telegram adapter imports", False, str(exc))
    else:
        check(
            "the adapter's namespace has _is_secret_shaped_document",
            hasattr(tadapter, "_is_secret_shaped_document"),
            "the injection site would raise NameError",
        )
        check(
            "the adapter's namespace has _redact_document_text",
            hasattr(tadapter, "_redact_document_text"),
            "the injection site would raise NameError",
        )
        # And the call the injection site actually makes must work.
        try:
            tadapter._is_secret_shaped_document("/tmp/nonexistent.txt", "x.txt", "text/plain")
            resolved = True
            detail = ""
        except Exception as exc:  # noqa: BLE001
            resolved = False
            detail = f"{type(exc).__name__}: {exc}"
        check(
            "the adapter can CALL the helper the injection site calls",
            resolved,
            detail,
        )

    tmpdir = Path(tempfile.mkdtemp(prefix="gwtest-", dir="/tmp"))
    os.chmod(tmpdir, 0o700)

    throwaway_pem = make_throwaway_key()
    throwaway_marker = throwaway_pem.splitlines()[1][:20]

    print("\n=== 1. a .pem file is secret-shaped and is NOT inlined ===")
    pem_path = tmpdir / "throwaway.pem"
    pem_path.write_text(throwaway_pem)
    check(
        ".pem detected as secret",
        gbase._is_secret_shaped_document(str(pem_path), "throwaway.pem", "application/octet-stream"),
    )

    print("\n=== 2. the same content with a HARMLESS name is still caught ===")
    sneaky_path = tmpdir / "notes.txt"
    sneaky_path.write_text(throwaway_pem)
    check(
        "key content in a .txt is caught by the content check",
        gbase._is_secret_shaped_document(str(sneaky_path), "notes.txt", "text/plain"),
    )

    print("\n=== 3. an ordinary .txt is NOT secret-shaped ===")
    plain_path = tmpdir / "readme.txt"
    plain_path.write_text("This is a perfectly ordinary note about recipes.\n" * 5)
    check(
        "ordinary .txt is not secret-shaped",
        not gbase._is_secret_shaped_document(str(plain_path), "readme.txt", "text/plain"),
    )

    print("\n=== 4. .env and .key are secret-shaped by extension ===")
    for name in ("prod.env", "id_rsa", "server.key", "credentials.json"):
        p = tmpdir / name
        p.write_text("harmless content here")
        check(
            f"{name} detected as secret",
            gbase._is_secret_shaped_document(str(p), name, "text/plain"),
        )

    print("\n=== 5. what IS inlined gets redacted ===")
    mixed = "Here is my shopping list.\n" + throwaway_pem + "\nAnd the price of rice is 2 euros.\n"
    redacted = gbase._redact_document_text(mixed)
    check(
        "the key is redacted out of inlined text",
        throwaway_marker not in redacted,
        "marker removed" if throwaway_marker not in redacted else "MARKER STILL PRESENT",
    )
    check(
        "the ordinary text survives redaction",
        "shopping list" in redacted,
    )
    check(
        "redaction is a no-op on clean text",
        gbase._redact_document_text("nothing secret here") == "nothing secret here",
    )

    print("\n=== 6. the cached document is written at mode 0600 ===")
    cache_dir = gbase.get_document_cache_dir()
    cached = gbase.cache_document_from_bytes(b"throwaway bytes", "gwtest-doc.txt")
    mode = stat.S_IMODE(os.stat(cached).st_mode)
    check(f"cached file mode is 0600 (got {oct(mode)[2:]})", mode == 0o600)
    dmode = stat.S_IMODE(os.stat(cache_dir).st_mode)
    check(f"cache dir mode is 0700 (got {oct(dmode)[2:]})", dmode == 0o700)
    os.unlink(cached)

    print("\n=== 7. the cached path for a SECRET file is still usable by the agent ===")
    cached2 = gbase.cache_document_from_bytes(throwaway_pem.encode(), "gwtest-secret.pem")
    check("the secret file is cached (agent can read it)", os.path.exists(cached2))
    check(
        "and it is still detected as secret-shaped",
        gbase._is_secret_shaped_document(cached2, "gwtest-secret.pem", ""),
    )
    os.unlink(cached2)

    # cleanup
    for f in tmpdir.iterdir():
        f.unlink()
    tmpdir.rmdir()

    failed = [r for r in results if r[1] == FAIL]
    print("\n" + "=" * 60)
    print(f"  {len(results) - len(failed)} passed, {len(failed)} failed")
    if failed:
        for name, _, detail in failed:
            print(f"    FAILED: {name} {detail}")
    print("=" * 60)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
