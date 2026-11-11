#!/usr/bin/env python3
"""Closed market allowlist mutation harness, including row identity conflicts."""
import importlib.util
import json
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import unicodedata

TOOL = Path(__file__).with_name('check-sourcing-market.py')
spec = importlib.util.spec_from_file_location('market', TOOL)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def run(*args):
    return subprocess.run([sys.executable, str(TOOL), *args], capture_output=True, text=True)


def main():
    assert len(m.MARKETS) == 250
    for code in m.MARKETS:
        assert m.is_sourceable(code)[0], code
    for name in ('Germany', 'Indonesia', 'Switzerland', 'United States', 'Kosovo', ' DE '):
        assert m.is_sourceable(name)[0], name
    assert run('--row', json.dumps({'country_code':'DE', 'country':'Germany'})).returncode == 0
    print('  baseline passes: 250 market codes and consistent named row')
    cases = []
    for name in sorted(m.NOT_A_MARKET):
        for variant in (name.upper(), '  '+name.replace(' ', '\t  ')+'\n', unicodedata.normalize('NFD', name), ''.join(c for c in unicodedata.normalize('NFD', name) if not unicodedata.combining(c))):
            cases.append((name, [variant]))
    for value in ('Atlantis', 'Newly Added Origin', 'AN', 'DD', 'ZZ', '', '  ', 'Indung Kampampangan', 'China', 'Palestine', 'Netherlands'):
        cases.append((repr(value), [value]))
    for row in ({}, {'country':None}, {'country':''}, {'country':3}, {'country':[]},
                {'country_code':'DE', 'geo_entity':'Asia'}, {'country_code':'DE', 'country':None},
                {'country_code':'DE', 'market':'ID'}, {'country_code':None, 'country':'Germany'},
                {'country_code':'DE', 'country':{}}, {'country_code':'DE', 'country':'New Origin'}):
        cases.append((repr(row), ['--row', json.dumps(row)]))
    cases.extend([('duplicate field masks nonmarket', ['--row', '{"country_code":"Asia","country_code":"DE"}']), ('malformed JSON', ['--row', '{']), ('not an object', ['--row', '[]']), ('empty JSON', ['--row', ''])])
    with tempfile.TemporaryDirectory() as tmp:
        codes = Path(tmp) / 'codes'
        codes.write_text('DE\nID\n')
        assert run('--iso-codes', str(codes), 'Germany', 'XK').returncode == 0
        cases.extend([('outside supplied set', ['--iso-codes', str(codes), 'US']),
                      ('unknown despite supplied set', ['--iso-codes', str(codes), 'Atlantis'])])
        for label, args in cases:
            proc = run(*args)
            assert proc.returncode != 0 and ('NOT A MARKET' in proc.stdout or 'FAILED' in proc.stdout), (label, proc.stdout, proc.stderr)
    print(f'{len(cases)}/{len(cases)} mutations caught')

    # ── The live reconciliation ───────────────────────────────────
    # The deny-list is GENERATED from the live geo_entities table, so
    # the two must agree: every live country row must be classified
    # exactly as the snapshot says. This is the check that catches a
    # row ADDED to the database after the list file was generated.
    #
    # It needs a live snapshot, which requires a read-only database
    # query. When none is supplied the check does NOT run, and the
    # harness says so rather than implying a pass.
    snapshot = os.environ.get('SOURCING_MARKET_SNAPSHOT')
    if not snapshot or not os.path.exists(snapshot):
        print('  Live database reconciliation NOT RUN -- no snapshot supplied.')
        print('    Set SOURCING_MARKET_SNAPSHOT to a file of')
        print('    "<name>|<iso_code>" lines to run it.')
        return 0

    rows = []
    for line in open(snapshot, encoding='utf-8').read().splitlines():
        if not line.strip():
            continue
        name, _, code = line.partition('|')
        rows.append((name.strip(), code.strip()))

    # The deny-list is a list of NAMES, and the live table has 302 rows
    # but 300 distinct names -- China and Palestine each have two. So
    # the comparison is over DISTINCT NAMES.
    names = {name for name, _ in rows}
    rejected = sorted(n for n in names if m.is_sourceable(n)[0] is False)
    accepted = sorted(n for n in names if m.is_sourceable(n)[0] is True)
    expected_rejected = len(m.NOT_A_MARKET)
    print(f'  The live reconciliation: {len(rows)} rows, {len(names)} distinct names.')
    print(f'    rejected: {len(rejected)} (the deny-list holds {expected_rejected} names)')
    print(f'    accepted: {len(accepted)}')
    if len(rejected) != expected_rejected:
        print(f'    FAILED: the live table has {len(rejected)} non-market names, '
              f'but the deny-list holds {expected_rejected}.')
        extra = sorted(set(rejected) - set(m.NOT_A_MARKET))
        gone = sorted(set(m.NOT_A_MARKET) - set(rejected))
        if extra:
            print(f'      rejected but not in the deny-list: {extra}')
        if gone:
            print(f'      in the deny-list but accepted: {gone}')
        print('      Regenerate scripts/sourcing-not-a-market.txt from the live table.')
        return 1
    print('  The live reconciliation agrees with the deny-list.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
