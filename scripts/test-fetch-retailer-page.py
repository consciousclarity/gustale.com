#!/usr/bin/env python3
"""Independent refusal mutations plus recorded-carrier pipeline tests; no network.

Transport is replaced at the urllib boundary in a subprocess. All capture,
validation, publication, CLI exit handling, and extraction use the real tools.
--tool permits proving that a regressed copy fails this unchanged harness.
"""
import argparse
import ast
import json
from pathlib import Path
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
ASIA = 'https://www.asiatischer-lebensmittelladen.de/produkt/pickels-pasten/tamarind-pasten/trs-tamarinde-paste-200g/'
TOKO = 'https://www.tokopedia.com/capsahabat/250gr-asam-jawa-tamarind-1729645910981903799'

# Recorded carrier excerpts, not full live captures. Read literals without running
# or changing the existing extractor harness. URLs come from the task/research doc.
TREE = ast.parse((HERE / 'test-extract-retailer-price.py').read_text())
FIXTURES = {node.targets[0].id: ast.literal_eval(node.value)
            for node in TREE.body if isinstance(node, ast.Assign)
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id in ('MOLLIE_PAGE', 'TOKOPEDIA_PAGE')}


def fixture(key, title):
    script = FIXTURES[key].split('\n', 1)[1]
    return f'<!doctype html><html><head><title>{title}</title></head><body><h1>{title}</h1>{script}</body></html>'


GOOD = fixture('MOLLIE_PAGE', 'TRS Tamarinde Paste 200 g')
# The subprocess runs the actual main(), injecting only deterministic boundary
# failures and damaged serialization/temp allocation for the relevant mutations.
RUNNER = r'''
import email.message, importlib.util, io, json, os, pathlib, socket, sys
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('fetcher_under_test', sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
cfg = json.loads(pathlib.Path(sys.argv[2]).read_text())
class Response(io.BytesIO):
    status = cfg.get('status', 200)
    headers = email.message.Message()
    headers['Content-Type'] = 'text/html; charset=utf-8'
    headers['Content-Length'] = str(cfg.get('length', len(cfg['body'].encode())))
    def geturl(self):
        return cfg['url']
def open_response(request, timeout):
    assert 'Mozilla/' in request.get_header('User-agent'), 'browser UA missing'
    if cfg.get('dns'):
        raise socket.gaierror('fixture DNS resolution failure')
    return Response(cfg['body'].encode())
original_write = pathlib.Path.write_text
def damaged_write(path, text, *a, **kw):
    if cfg.get('missing_source') and path.name == 'raw.html':
        text = text.replace('URL Source:', 'Source:')
    return original_write(path, text, *a, **kw)
original_temp = m.tempfile.TemporaryDirectory
class SharedTemp:
    def __init__(self, *a, **kw):
        self.path = pathlib.Path(cfg['shared'])
        self.path.mkdir(mode=0o755)
        self.path.chmod(0o755)
    def __enter__(self):
        return str(self.path)
    def __exit__(self, *a):
        pass
with patch.object(m, 'urlopen', open_response), patch.object(pathlib.Path, 'write_text', damaged_write), patch.object(m.tempfile, 'TemporaryDirectory', SharedTemp if cfg.get('shared') else original_temp):
    sys.argv = [sys.argv[1], cfg['url'], '--output', cfg['output']]
    sys.exit(m.main())
'''


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--tool', type=Path, default=HERE / 'fetch-retailer-page.py')
    ap.add_argument('--artifacts', type=Path, help='new directory to retain fixture captures/results')
    args = ap.parse_args()
    tool = args.tool.resolve()
    with tempfile.TemporaryDirectory(prefix='test-retailer-') as tmp:
        root = Path(tmp)
        runner = root / 'runner.py'
        runner.write_text(RUNNER)
        def run(label, body=GOOD, url=ASIA, **changes):
            output = root / label
            cfg = dict(body=body, url=url, output=str(output), **changes)
            config = root / (label + '.json')
            config.write_text(json.dumps(cfg))
            proc = subprocess.run([sys.executable, str(runner), str(tool), str(config)],
                                  capture_output=True, text=True)
            return proc, output

        results = []
        if args.artifacts:
            args.artifacts.mkdir(parents=True, exist_ok=False)
        for label, key, name, url, expected in [
            ('asia', 'MOLLIE_PAGE', 'TRS Tamarinde Paste 200 g', ASIA,
             ('2.49', 'EUR', '1', 'mollie')),
            ('tokopedia', 'TOKOPEDIA_PAGE', '250gr Asam Jawa / Tamarind', TOKO,
             ('Rp28.000', 'IDR', '1', 'tokopedia-hydration')),
        ]:
            body = fixture(key, name)
            proc, output = run(label, body, url)
            assert proc.returncode == 0, (label, proc.stderr)
            assert (output / 'response.html').read_bytes() == body.encode()
            assert (output.stat().st_mode & 0o777) == 0o700
            assert 'Capture Format: raw HTML' in (output / 'raw.html').read_text()
            md = (output / 'rendered.md').read_text()
            assert name in md and 'Capture Format: locally rendered Markdown' in md
            assert 'mollieApplePayDirectData' not in md and 'productID' not in md
            extracted = subprocess.run([sys.executable, str(HERE / 'extract-retailer-price.py'),
                '--page', str(output / 'raw.html'), '--product', name, '--json'],
                capture_output=True, text=True)
            assert extracted.returncode == 0, extracted.stderr
            result = json.loads(extracted.stdout)
            assert tuple(result[k] for k in ('price', 'currency', 'tier', 'carrier')) == expected, result
            results.append(dict(fixture=label, provenance='recorded excerpt; NOT live verification', **result))
            if args.artifacts:
                import shutil
                shutil.copytree(output, args.artifacts / label)
            print('  recorded-fixture pipeline:', label, *expected)
        if args.artifacts:
            (args.artifacts / 'results.json').write_text(json.dumps(results, indent=2) + '\n')

        cases = [
            ('HTTP 404', dict(status=404)),
            ('HTTP 204', dict(status=204)),
            ('empty body', dict(body='')),
            ('DNS failure', dict(dns=True)),
            ('bot challenge', dict(body='<html><head><title>Just a moment...</title></head><body>Verify you are human</body></html>')),
            ('error page HTTP 200', dict(body='<html><body>Internal server error</body></html>')),
            ('missing URL Source', dict(missing_source=True)),
            ('shared temp path', dict(shared=str(root / 'shared'))),
            ('truncated HTML', dict(body=GOOD[:-20])),
            ('truncated transfer', dict(length=len(GOOD.encode()) + 100)),
        ]
        caught = 0
        for index, (label, changes) in enumerate(cases):
            proc, output = run(f'mutation-{index}', **changes)
            assert proc.returncode != 0 and 'REFUSED:' in proc.stderr, (label, proc.returncode, proc.stdout, proc.stderr)
            assert not output.exists(), (label, 'published failed capture')
            assert not list(root.glob('.retailer-*')), (label, 'leaked staging files')
            caught += 1
            print('  caught:', label)
        print(f'{caught}/{len(cases)} mutations caught')
    return 0


if __name__ == '__main__':
    sys.exit(main())
