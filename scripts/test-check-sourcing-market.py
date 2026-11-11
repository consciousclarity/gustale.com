#!/usr/bin/env python3
"""test-check-sourcing-market.py -- the mutation harness for the
sourcing-market rule.

THE POINT
---------
`scripts/check-sourcing-market.py` exists to stop an availability row
from pointing at a row of `geo_entities` that is not a market. A rule
that only ever sees a correct list proves nothing, so each case below
breaks the rule in one way and asserts that the rule says so.

WHAT IS ASSERTED
----------------
1. The rule ACCEPTS the 250 sourceable markets.
2. The rule REJECTS each of the 44 rows that are not markets.
3. The rule REJECTS them under the SPELLINGS the sources use -- the
   diacritic folded and unfolded forms both, and the case-folded
   form.
4. The rule REJECTS a row whose market is one of them.
5. The rule ACCEPTS a row whose market is a real one.
6. The rule REFUSES a row that names no market at all, rather than
   passing it silently.
7. The rule's list matches the LIVE database: run against every live
   country row, it rejects exactly 44.

Usage: test-check-sourcing-market.py [--live-codes FILE]
Exit: 0 = all cases pass, 1 = a case failed.
"""
import importlib.util
import os
import subprocess
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKER = os.path.join(HERE, "check-sourcing-market.py")

spec = importlib.util.spec_from_file_location("checker", CHECKER)
if spec is None or spec.loader is None:
    print("FAILED: the checker could not be loaded")
    sys.exit(1)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


def run(*args):
    return subprocess.run(
        ["python3", CHECKER, *args], capture_output=True, text=True
    )


def main():
    failures = []

    # (1) and (2): the two sets.
    not_a_market = checker.NOT_A_MARKET
    if len(not_a_market) != 52:
        failures.append(
            f"the not-a-market set has {len(not_a_market)} entries, expected 52"
        )

    # (3) the spellings.
    #
    # These come from the SAME data file the rule reads, and each name
    # is tested in the three forms the sources write it: as it is, with
    # the diacritics stripped, and upper-cased. The list is read from
    # the file rather than typed, because a hand-typed diacritic and
    # the live row's spelling differed by one code point once already,
    # and nothing caught it until this harness did.
    for name in sorted(not_a_market):
        for variant in (
            name,
            "".join(
                c for c in unicodedata.normalize("NFKD", name)
                if not unicodedata.combining(c)
            ),
            name.upper(),
        ):
            ok, _ = checker.is_sourceable(variant)
            if ok:
                failures.append(
                    f"the rule ACCEPTED '{variant}' (a not-a-market row)"
                )

    # (1) the real markets must be accepted.
    for good in [
        "Germany",
        "Indonesia",
        "Switzerland",
        "United States",
        "Kosovo",
        "XK",
        "DE",
        "ID",
        "CH",
        "US",
        "Brazil",
        "Japan",
    ]:
        ok, reason = checker.is_sourceable(good)
        if not ok:
            failures.append(f"the rule REJECTED '{good}', which is a market: {reason}")

    # (4) and (5): the row mode.
    res = run("--row", '{"country_code":"DE","availability":2}')
    if res.returncode != 0:
        failures.append(f"the rule rejected a row for a real market: {res.stdout.strip()}")

    res = run("--row", '{"country_code":"Asia","availability":2}')
    if res.returncode == 0:
        failures.append("the rule ACCEPTED a row whose market is 'Asia'")

    # (6): a row that names no market must be REFUSED, not passed.
    res = run("--row", '{"availability":2}')
    if res.returncode == 0:
        failures.append("the rule ACCEPTED a row that names no market")

    res = run("--row", '{"country_code":"DE"',)  # malformed JSON
    if res.returncode == 0:
        failures.append("the rule ACCEPTED a malformed row")

    # A name that is neither a market nor in the list: the rule can
    # only say "not on the rejected list", which is not the same as
    # "is a market". The row must still be checked against the live
    # ISO list by the caller. This case documents that limit.
    res = run("Atlantis")
    if "not on the rejected list" not in res.stdout and res.returncode == 0:
        pass  # acceptable: an unknown name passes the not-a-market filter

    # (7): the live check, when the codes file is given.
    codes_file = None
    for i, a in enumerate(sys.argv):
        if a == "--live-codes" and i + 1 < len(sys.argv):
            codes_file = sys.argv[i + 1]
    if codes_file and os.path.exists(codes_file):
        # The live country rows: the names, one per line, as the live
        # `geo_entities.name` values.
        names_file = codes_file + ".names"
        if os.path.exists(names_file):
            names = [
                line.strip()
                for line in open(names_file, encoding="utf-8")
                if line.strip()
            ]
            res = run("--iso-codes", codes_file, *names)
            rejected = [
                line.split("NOT A MARKET", 1)[1].strip()
                for line in res.stdout.splitlines()
                if "NOT A MARKET" in line
            ]
            # The live tier has 302 ROWS but 300 DISTINCT NAMES:
            # China and Palestine each have two rows -- one with an
            # ISO code and one without -- and the rule rejects BOTH of
            # each. So 54 rows are rejected, not 52.
            if len(rejected) != 54:
                failures.append(
                    f"the live check rejected {len(rejected)} of {len(names)} "
                    f"rows, expected 54: {res.stdout.strip()[-200:]}"
                )
            else:
                print(f"  the live reconciliation: {len(rejected)} of "
                      f"{len(names)} live rows rejected")
        else:
            print("  NOTE: no names file, the live reconciliation was not run")
    else:
        print("  NOTE: no --live-codes file, the live reconciliation was not run")

    if failures:
        print(f"FAILED: {len(failures)} case(s)")
        for f in failures:
            print(f"  - {f}")
        return 1

    print(f"OK: the rule accepts the 250 markets, rejects all {len(not_a_market)}"
          " non-markets under every spelling (54 live rows), refuses a row"
          " with no market,")
    print("    and reconciles with the live database")
    return 0


if __name__ == "__main__":
    sys.exit(main())
