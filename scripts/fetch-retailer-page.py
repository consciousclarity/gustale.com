#!/usr/bin/env python3
"""Capture HTTPS retailer HTML and local Markdown atomically (no JS execution).

Usage: scripts/fetch-retailer-page.py URL --output NEW_DIRECTORY
Feed NEW_DIRECTORY/raw.html to extract-retailer-price.py. response.html preserves
original response bytes; rendered.md is for reading, never price ownership.
Requires complete HTML with closing body/html tags; refuses ambiguous captures.
"""
import argparse
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

MAX_BYTES = 32 * 1024 * 1024
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'


def require_url(url):
    u = urlsplit(url)
    if (u.scheme != 'https' or not u.hostname or u.username or u.password
            or u.fragment or any(c.isspace() or ord(c) < 32 for c in url)):
        raise ValueError('one HTTPS product URL without credentials/fragment required')
    _ = u.port
    return url


class Markdown(HTMLParser):
    """Render visible server HTML; deliberately omit script/style/template data."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.hidden = []
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'template', 'noscript'):
            self.hidden.append(tag)
        if self.hidden:
            return
        if tag in ('p', 'div', 'br', 'tr', 'section'):
            self.parts.append('\n\n')
        if re.fullmatch('h[1-6]', tag):
            self.parts.append('\n\n' + '#' * int(tag[1]) + ' ')
        if tag == 'li':
            self.parts.append('\n- ')

    def handle_endtag(self, tag):
        if self.hidden:
            if tag == self.hidden[-1]:
                self.hidden.pop()
            return
        if tag in ('p', 'div', 'li', 'tr') or re.fullmatch('h[1-6]', tag):
            self.parts.append('\n\n')

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(re.sub(r'\s+', ' ', data))

    def render(self):
        return re.sub(r'\n\s*\n(?:\s*\n)+', '\n\n', ''.join(self.parts)).strip()


def validate_html(body):
    if not body.strip():
        raise ValueError('empty response body')
    if not re.search(r'</body\s*>\s*</html\s*>\s*(?:<!--.*?-->\s*)*$', body, re.I | re.S):
        raise ValueError('truncated or incomplete HTML (closing body/html required)')
    parser = Markdown()
    parser.feed(body)
    visible = parser.render()
    title = re.search(r'<title\b[^>]*>(.*?)</title>', body, re.I | re.S)
    heading = (title.group(1) if title else '') + '\n' + visible[:4000]
    if re.search(r'just a moment|verify (?:that )?you are human|access denied|'
                 r'checking your browser|captcha|robot check|attention required|'
                 r'page not found|service unavailable|internal server error|'
                 r'403 forbidden|404 not found|enable javascript and cookies', heading, re.I):
        raise ValueError('bot challenge or error page')
    if not visible.strip():
        raise ValueError('no readable content (possible challenge/client-only shell)')
    return visible


def validate_capture(text, url):
    sources = re.findall(r'^URL Source:[ \t]*(\S+)[ \t]*$', text, re.M)
    if sources != [url]:
        raise ValueError('capture must contain exactly one matching URL Source line')


def capture(url, output):
    require_url(url)
    output = Path(output).absolute()
    if output.exists() or output.is_symlink():
        raise ValueError('output already exists; choose a new capture directory')
    # Stage everything privately on the destination filesystem, then publish once.
    with tempfile.TemporaryDirectory(prefix='.retailer-', dir=output.parent) as tmp:
        session = Path(tmp)
        info = session.lstat()
        if (not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700
                or info.st_uid != os.getuid() or session.parent != output.parent
                or not session.name.startswith('.retailer-')):
            raise ValueError('refusing shared or non-private temporary directory')
        request = Request(url, headers={'User-Agent': UA, 'Accept': 'text/html',
                                        'Accept-Encoding': 'identity'})
        with urlopen(request, timeout=60) as response:
            if response.status != 200:
                raise ValueError(f'HTTP {response.status}; expected 200')
            final_url = require_url(response.geturl())
            if response.headers.get_content_type() != 'text/html':
                raise ValueError('expected text/html response')
            if response.headers.get('Content-Encoding', 'identity').lower() != 'identity':
                raise ValueError('unexpected encoded response')
            data = response.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise ValueError('response exceeds capture limit; refusing truncation')
            length = response.headers.get('Content-Length')
            if length is not None and int(length) != len(data):
                raise ValueError('truncated transfer: Content-Length mismatch')
            body = data.decode(response.headers.get_content_charset() or 'utf-8', errors='strict')
        markdown = validate_html(body)
        # Final response URL binds the evidence after redirects; retain requested URL in manifest.
        raw = f'URL Source: {final_url}\nCapture Format: raw HTML\n\n{body}'
        rendered = (f'URL Source: {final_url}\nCapture Format: locally rendered Markdown '
                    '(server HTML only; JavaScript not executed)\n\n' + markdown + '\n')
        for name, content in [('raw.html', raw), ('rendered.md', rendered)]:
            (session / name).write_text(content, encoding='utf-8')
            validate_capture((session / name).read_text(encoding='utf-8'), final_url)
        (session / 'response.html').write_bytes(data)
        (session / 'manifest.json').write_text(json.dumps({
            'requested_url': url, 'final_url': final_url,
            'fetched_at': datetime.now(timezone.utc).isoformat(), 'status': 200,
            'response_bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'renderer': 'local server HTML; no JavaScript execution',
        }, indent=2) + '\n', encoding='utf-8')
        os.rename(session, output)
    return output


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('url')
    ap.add_argument('--output', required=True, help='new directory in an existing parent')
    args = ap.parse_args()
    try:
        path = capture(args.url, args.output)
    except Exception as exc:
        print(f'REFUSED: {exc}', file=sys.stderr)
        return 1
    print(path)
    return 0


if __name__ == '__main__':
    sys.exit(main())
