#!/usr/bin/env python3
"""Fail the build if the retired recipes host appears in apps/ or packages/.

WHAT THIS IS
------------
The single-domain cutover makes `gustale.com` the ONLY domain.
`gustale.recipes` and `recipes.gustale.com` become 301-only.

A build that still mentions the retired host is a build that will
serve a link to it, a canonical that points at it, or an og:url that
tells a crawler the wrong thing. The failure is quiet when it happens:
the page still renders, the link still works (it redirects), and the
defect only shows up as a crawl that bounces.

So the reference has to be caught at build time, not at crawl time.

WHAT IT SCANS
-------------
    apps/       the API and the web app
    packages/   the shared libraries

Those are the two trees that ship. `docs/`, `infra/` and `scripts/`
are NOT scanned, and the reason is different for each:

  * `docs/` records what happened. A receipt that says "the host was
    gustale.recipes" is history, and history is the point.
  * `infra/prod/caddy/sites/` holds the REDIRECT CONFIG. It has to
    name the host it redirects FROM.
  * `scripts/` holds the redirect rules and the guard's own allowlist.

WHAT IT ALLOWS
--------------
Three kinds of reference survive the cutover, and each has a reason
that is written down at the entry:

  1. THE REDIRECT CONFIGURATION — the Caddy site blocks and the guard
     scripts, which must name the host they redirect from.
  2. THE LEGACY-ORIGIN TRUST LIST — `apps/api/src/auth.ts`. During
     the transition a browser that is mid-session on a retired host
     must still be able to finish signing in.
  3. THE FROZEN MIGRATIONS — a migration that has been applied to
     production is immutable (docs/RULES.md, rule 11), so a historical
     migration that mentions the old host cannot be edited. It is also
     a DANGEROUS thing to edit: the migration's checksum is what the
     receipt records.

A test that ASSERTS THE REDIRECT is also allowed, for the same reason
the redirect config is allowed: it has to name the host to check it.

HOW TO RUN IT
-------------
    python3 scripts/check-no-legacy-recipes-domain.py

    --root DIR    the repository to scan (default: the repo this file
                  is in)
    --json        print a machine-readable report

EXIT CODES
----------
    0  no forbidden reference
    1  a forbidden reference was found
    2  the script could not run (bad arguments, unreadable tree)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# The retired host, as a REGEX.
#
# It matches the host and anything under it:
#
#   gustale.recipes
#   www.gustale.recipes
#   api.gustale.recipes
#   recipes.gustale.com
#
# The first three are the retired host and its subdomains. The fourth
# is the third retired host. All four are being switched off.
#
# It is a regex rather than a plain substring so that a filename or a
# path that merely contains the words is not a false positive.
LEGACY_PATTERN = re.compile(
    r"(?:[a-z0-9-]+\.)*gustale\.recipes"  # the retired host + subdomains
    r"|recipes\.gustale\.com",  # the third retired host
    re.IGNORECASE,
)

# The trees that ship.
SCAN_TREES = ("apps", "packages")

# Directories that are never scanned: build output, dependencies, and
# the VCS metadata. A scan that read node_modules would take minutes
# and find nothing.
SKIP_DIRS = {
    ".git",
    "node_modules",
    "dist",
    ".astro",
    ".turbo",
    ".vercel",
    ".next",
    "coverage",
    "__pycache__",
}

# The files that may name the retired host, and WHY.
#
# The reason is not decoration: a guard entry without a reason is an
# entry that nobody dares to remove, and a year later it is a hole
# with no one left who knows what it was for.
ALLOWLIST: dict[str, str] = {
    # THE LEGACY-ORIGIN TRUST LIST.
    #
    # During the transition a browser that is mid-session on a retired
    # host must still be able to complete a sign-in and land on a
    # working page. Removing the origin the moment the redirect goes
    # live signs the reader out at the door of the new site.
    #
    # REMOVE THIS ENTRY when the transition is over.
    "apps/api/src/auth.ts": (
        "the transition-only trustedOrigins list: a session that starts "
        "on a retired host must be able to finish"
    ),

    # A FROZEN HISTORICAL MIGRATION.
    #
    # Rule 11 (docs/RULES.md): an applied migration is immutable. Its
    # checksum is what the live receipt records. Editing it to remove
    # a string would break the chain check and invalidate the receipt.
    "packages/db/drizzle/0013_passkey_aaguid.sql": (
        "a frozen migration: an applied migration is immutable (rule 11) "
        "and its checksum is in the live receipt"
    ),
}

# The ALLOWLIST may name a path that does not exist yet. A typo in an
# allowlist entry would silently allow nothing, so the guard checks
# that every entry still matches a file that exists. It is a WARNING,
# not a failure: an entry for a file that has been deleted is worth
# knowing about, but it is not a reason to fail a build over a stale
# allowlist entry alone.


def scan(root: Path) -> list[dict[str, object]]:
    """Every forbidden reference, as a list of records."""
    findings: list[dict[str, object]] = []

    for tree in SCAN_TREES:
        tree_path = root / tree
        if not tree_path.is_dir():
            continue

        for path in sorted(tree_path.rglob("*")):
            if not path.is_file():
                continue
            if any(part in SKIP_DIRS for part in path.parts):
                continue

            rel = path.relative_to(root).as_posix()
            if rel in ALLOWLIST:
                continue

            # Binary files are skipped. A PNG that happens to contain
            # the byte sequence is not a reference.
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue

            for lineno, line in enumerate(text.splitlines(), start=1):
                for match in LEGACY_PATTERN.finditer(line):
                    findings.append(
                        {
                            "file": rel,
                            "line": lineno,
                            "match": match.group(0),
                            "text": line.strip()[:200],
                        }
                    )
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fail if the retired recipes host appears in apps/ or packages/.",
    )
    default_root = Path(__file__).resolve().parent.parent
    parser.add_argument("--root", type=Path, default=default_root)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    root = args.root.resolve()
    if not root.is_dir():
        print(f"::error::{root} is not a directory", file=sys.stderr)
        return 2

    findings = scan(root)

    # The stale-allowlist check.
    stale_entries = []
    for rel in ALLOWLIST:
        if not (root / rel).exists():
            stale_entries.append(rel)

    if args.json:
        print(
            json.dumps(
                {
                    "root": str(root),
                    "findings": findings,
                    "stale_allowlist_entries": stale_entries,
                    "ok": not findings,
                },
                indent=2,
            )
        )
        return 1 if findings else 0

    print("=== the retired-host guard ===")
    print(f"  scanning {', '.join(SCAN_TREES)}/ under {root}")
    print(f"  the retired host: {LEGACY_PATTERN.pattern}")

    if ALLOWLIST:
        print("  allowed references:")
        for rel, reason in ALLOWLIST.items():
            print(f"    - {rel}")
            print(f"        because {reason}")

    for rel in stale_entries:
        print(
            f"  ::warning::the allowlist names {rel}, which does not exist. "
            "The entry can be removed."
        )

    if not findings:
        print("  OK: no reference to the retired host in the shipping trees.")
        print("=== the retired-host guard: PASSED ===")
        return 0

    print(f"  ::error::{len(findings)} reference(s) to the retired host:")
    for f in findings:
        print(f"  {f['file']}:{f['line']}: {f['text']}")
    print()
    print("  The site is ONE site now: gustale.com.")
    print("  A reference to the retired host here means either")
    print("    - a link, a canonical, an og:url or a sitemap entry that")
    print("      points at a host that is being switched off; or")
    print("    - a comment that describes a world that no longer exists.")
    print()
    print("  If the reference is legitimate, add the file to ALLOWLIST in")
    print("  scripts/check-no-legacy-recipes-domain.py WITH A REASON.")
    print("=== the retired-host guard: FAILED ===")
    return 1


if __name__ == "__main__":
    sys.exit(main())
