#!/usr/bin/env python3
"""Exercise the real shell tool with deterministic HTTP/transport mutations."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import tempfile

TOOL = Path(__file__).with_name('bpom-registry.sh')
QUERY = 'asam jawa / café & ? # + ='
MOCK = r'''#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
mode = os.environ.get('BPOM_TEST_MODE', '')
def option(key):
    return args[args.index(key)+1]
out = pathlib.Path(option('-o'))
query = os.environ['BPOM_TEST_QUERY']
if '-G' in args:
    assert 'query='+query in args
    assert 'https://cekbpom.pom.go.id/all-produk' in args
    jar = pathlib.Path(option('-c'))
    assert str(jar) != '/tmp/bpom.cookies'
    jar.write_text(str(os.getppid()))
    text = "<meta content='token123' name='csrf-token'>"
    if mode == 'missing-token': text = '<html>challenge</html>'
    if mode == 'duplicate-token': text += text
    if mode == 'header-injection': text = '<meta name="csrf-token" content="bad&#10;token">'
    if mode == 'get-network': sys.exit(7)
    status = '503' if mode == 'get-http' else '200'
else:
    assert 'search[value]='+query in args
    assert 'X-CSRF-TOKEN: token123' in args
    assert option('-b') == option('-c')
    assert pathlib.Path(option('-b')).read_text() == str(os.getppid())
    if mode == 'post-network': sys.exit(28)
    status = '419' if mode == 'post-csrf' else '500' if mode == 'post-http' else '200'
    data = {'data': [], 'recordsTotal': 0, 'recordsFiltered': 0}
    if mode == 'error-json': data['error'] = 'denied'
    if mode == 'missing-data': data.pop('data')
    if mode == 'wrong-data': data['data'] = {}
    if mode == 'non-object-row': data.update(data=[42], recordsTotal=1, recordsFiltered=1)
    if mode == 'bad-count': data['recordsTotal'] = True
    if mode == 'inconsistent-count': data['recordsFiltered'] = 1
    text = '<html>login</html>' if mode == 'html' else json.dumps(data)
    if mode == 'duplicate-json': text = text.replace('"data": []', '"data": [42], "data": []')
out.write_text(text)
print(status, end='')
'''


def main():
    with tempfile.TemporaryDirectory() as tmp:
        curl = Path(tmp) / 'curl'
        curl.write_text(MOCK)
        curl.chmod(0o755)
        env = dict(os.environ, PATH=tmp + os.pathsep + os.environ['PATH'], BPOM_TEST_QUERY=QUERY, TMPDIR=tmp)
        def run(mode='', query=QUERY, length='25'):
            return subprocess.run(['bash', str(TOOL), query, length], env=dict(env, BPOM_TEST_MODE=mode), capture_output=True, text=True, timeout=20)
        baseline = run()
        assert baseline.returncode == 0, baseline.stderr
        assert json.loads(baseline.stdout)['data'] == []
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            for result in pool.map(lambda _: run(), range(2)):
                assert result.returncode == 0, result.stderr
        print('  baseline passes: encoded special query, reordered/single-quoted token, private concurrent sessions, empty result')
        cases = [(mode, mode.split('-')[0]) for mode in (
            'missing-token', 'duplicate-token', 'header-injection', 'get-network', 'get-http',
            'post-network', 'post-csrf', 'post-http', 'error-json', 'missing-data',
            'wrong-data', 'bad-count', 'inconsistent-count', 'html', 'non-object-row', 'duplicate-json')]
        for mode, _ in cases:
            result = run(mode)
            assert result.returncode != 0 and not result.stdout and 'REFUSED:' in result.stderr, (mode, result)
            expected = 'transport' if 'network' in mode else 'HTTP' if mode in ('get-http', 'post-http', 'post-csrf') else 'CSRF token' if mode in ('missing-token', 'duplicate-token', 'header-injection') else 'JSON'
            assert expected in result.stderr, (mode, result.stderr)
            print('  caught:', mode)
        invalid = [('', '25'), ('  ', '25'), (QUERY, '0'), (QUERY, '-1'), (QUERY, 'oops'), (QUERY, '10000')]
        for query, length in invalid:
            result = run(query=query, length=length)
            assert result.returncode != 0 and 'usage:' in result.stderr
        assert list(Path(tmp).iterdir()) == [curl], 'session files leaked'
        total = len(cases) + len(invalid)
        print(f'{total}/{total} mutations caught')


if __name__ == '__main__':
    main()
