#!/usr/bin/env python3
"""Call the GitHub API as the gustale-bot App.

WHY: the PAT was revoked; the App is the only identity. gh-app.sh has a .sh
suffix but is Python, so it needs an explicit SourceFileLoader.

USAGE:
    python3 scripts/hermes/app_api.py GET repos/consciousclarity/gustale.com/pulls/199
    python3 scripts/hermes/app_api.py POST repos/.../labels '{"labels":["approved-live"]}'
"""
from __future__ import annotations

import importlib.machinery
import importlib.util
import sys
from pathlib import Path

GH_APP = Path(__file__).resolve().parent / "gh-app.sh"


def load():
    # gh-app.sh is Python with a .sh suffix, so spec_from_file_location
    # returns None unless the loader is given explicitly.
    spec = importlib.util.spec_from_file_location(
        "gh_app", GH_APP,
        loader=importlib.machinery.SourceFileLoader("gh_app", str(GH_APP)),
    )
    if spec is None or spec.loader is None:
        raise SystemExit(f"::error::cannot load {GH_APP}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    mod = load()
    # gh-app.sh's `api` mode takes <METHOD> <path> [json-body].
    return mod.main(["api", *argv])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
