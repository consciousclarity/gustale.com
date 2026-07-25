#!/usr/bin/env python3
"""
Upload generated dish images to Gustale.

What this script does:
  1. Reads PNG files from /tmp/gustale-images-batch/ (one per dish slug)
  2. Authenticates to Gustale via better-auth (email + password)
  3. For each image, in order:
     a. POST /api/media/upload (multipart)  → media_id
     b. POST /api/dishes/<slug>/media       → attaches with role='cover'
  4. Writes a CSV manifest with results: slug, status, media_id, error
  5. Resumes safely — skips already-processed slugs unless FORCE=1

Modes:
  DRY_RUN=1  — list what would happen, do not upload (default safety)
  FORCE=1    — re-upload even if slug is already in manifest.csv
  LIMIT=N    — process only first N dishes (for testing)

Usage:
  # 1. Preview — no uploads
  DRY_RUN=1 python3 scripts/upload-dish-images.py

  # 2. Test with first 2 dishes
  python3 scripts/upload-dish-images.py --limit 2

  # 3. Full run
  python3 scripts/upload-dish-images.py

Env vars (required for real upload, ignored in DRY_RUN):
  GUSTALE_API_BASE      default: https://api.gustale.com
  GUSTALE_EMAIL         Gustale login email
  GUSTALE_PASSWORD      Gustale login password
  GUSTALE_DRY_RUN       1 = dry-run (default 0)
  GUSTALE_FORCE         1 = re-upload (default 0)
  GUSTALE_LIMIT         integer N to limit processed dishes

Manifest output:
  scripts/upload-manifest.csv     per-dish results
  scripts/upload-manifest.json    same as JSON

Auth note:
  Better-auth expects form-urlencoded POST to /api/auth/sign-in/email
  with fields { email, password } and returns the session cookie.
  We capture and forward the cookie on every subsequent request.
"""

import argparse
import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import http.cookiejar
from pathlib import Path
from typing import Optional

# ─── Configuration ────────────────────────────────────────────────────────
DEFAULT_API_BASE = 'https://api.gustale.com'
DEFAULT_IMAGE_DIR = '/tmp/gustale-images-batch'
DEFAULT_MANIFEST_DIR = Path(__file__).parent
MANIFEST_CSV = DEFAULT_MANIFEST_DIR / 'upload-manifest.csv'
MANIFEST_JSON = DEFAULT_MANIFEST_DIR / 'upload-manifest.json'

# How long to wait between requests to avoid hammering the API
RATE_LIMIT_SECONDS = 0.5

# ─── Cookie-aware opener (better-auth sets __Secure-gustale.session_token) ─
COOKIE_JAR = http.cookiejar.CookieJar()
OPENER = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(COOKIE_JAR))


def log(msg: str) -> None:
    print(f'[{time.strftime("%H:%M:%S")}] {msg}', file=sys.stderr, flush=True)


def request(
    method: str,
    url: str,
    data: Optional[bytes] = None,
    headers: Optional[dict] = None,
    timeout: int = 60,
) -> tuple[int, dict, bytes]:
    """HTTP request with cookie jar. Returns (status, response_headers, body_bytes)."""
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with OPENER.open(req, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def sign_in(api_base: str, email: str, password: str) -> bool:
    """Authenticate via better-auth email+password. Sets cookie in COOKIE_JAR."""
    log(f'sign-in as {email}...')
    body = urllib.parse.urlencode({'email': email, 'password': password}).encode()
    status, headers, payload = request(
        'POST',
        f'{api_base}/api/auth/sign-in/email',
        data=body,
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
    )
    # better-auth returns 200 on success, 401 on bad creds
    cookies = [c.name for c in COOKIE_JAR]
    if status == 200 and any('session_token' in c for c in cookies):
        log(f'  ✓ signed in (cookies: {cookies})')
        return True
    log(f'  ✗ sign-in failed: HTTP {status} body={payload[:200]!r}')
    return False


def upload_image(
    api_base: str,
    slug: str,
    image_path: Path,
    alt_text: str,
    credit: str = 'AI-generated (Gemini 2.5 Flash)',
    license: str = 'CC-BY-SA-4.0',
    dry_run: bool = False,
) -> Optional[str]:
    """Upload the PNG to MinIO via /api/media/upload. Returns media_id or None."""
    if dry_run:
        log(f'  [DRY-RUN] would upload {image_path.name} ({image_path.stat().st_size} bytes)')
        return f'dry-run-{slug}'

    # Build multipart manually — Python's stdlib doesn't have a friendly
    # multipart encoder, but we can build one fairly cleanly.
    boundary = '----gustale-upload-' + str(int(time.time()))
    body = []

    def add_field(name: str, value: str) -> None:
        body.append(f'--{boundary}\r\n'.encode())
        body.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.append(value.encode('utf-8'))
        body.append(b'\r\n')

    add_field('altText', alt_text)
    add_field('credit', credit)
    add_field('license', license)

    # File part
    body.append(f'--{boundary}\r\n'.encode())
    body.append(
        f'Content-Disposition: form-data; name="file"; filename="{image_path.name}"\r\n'.encode()
    )
    body.append(b'Content-Type: image/png\r\n\r\n')
    body.append(image_path.read_bytes())
    body.append(b'\r\n')
    body.append(f'--{boundary}--\r\n'.encode())

    payload = b''.join(body)

    status, headers, response_body = request(
        'POST',
        f'{api_base}/api/media/upload',
        data=payload,
        headers={
            'Content-Type': f'multipart/form-data; boundary={boundary}',
            'Content-Length': str(len(payload)),
        },
        timeout=60,
    )

    if status == 200:
        try:
            data = json.loads(response_body)
            media_id = data.get('id') or data.get('mediaId')
            if media_id:
                log(f'  ✓ uploaded → media_id={media_id}')
                return media_id
            log(f'  ✗ upload returned 200 but no id: {response_body[:200]!r}')
            return None
        except json.JSONDecodeError:
            log(f'  ✗ upload returned 200 but invalid JSON: {response_body[:200]!r}')
            return None
    log(f'  ✗ upload failed: HTTP {status} body={response_body[:200]!r}')
    return None


def attach_to_dish(
    api_base: str,
    slug: str,
    media_id: str,
    role: str = 'cover',
    position: int = 0,
    dry_run: bool = False,
) -> bool:
    """POST /api/dishes/<slug>/media with {mediaId, role, position}."""
    if dry_run:
        log(f'  [DRY-RUN] would attach media_id={media_id} to {slug} as role={role}')
        return True

    payload = json.dumps({
        'mediaId': media_id,
        'role': role,
        'position': position,
    }).encode()

    status, headers, response_body = request(
        'POST',
        f'{api_base}/api/dishes/{slug}/media',
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'Content-Length': str(len(payload)),
        },
        timeout=30,
    )

    if status in (200, 201):
        log(f'  ✓ attached as role={role}')
        return True
    log(f'  ✗ attach failed: HTTP {status} body={response_body[:200]!r}')
    return False


def load_existing_manifest() -> list[dict]:
    """Resume support — read prior results so we don't re-upload."""
    if MANIFEST_CSV.exists():
        with open(MANIFEST_CSV, newline='') as f:
            return list(csv.DictReader(f))
    return []


def save_manifest(records: list[dict]) -> None:
    """Persist manifest in both CSV and JSON form."""
    if not records:
        return
    fieldnames = ['slug', 'status', 'media_id', 'role', 'attempted_at', 'error']
    with open(MANIFEST_CSV, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in records:
            writer.writerow({k: r.get(k, '') for k in fieldnames})
    with open(MANIFEST_JSON, 'w') as f:
        json.dump(records, f, indent=2)


def process_one(
    api_base: str,
    slug: str,
    image_path: Path,
    alt_text: str,
    dry_run: bool,
) -> dict:
    """Upload + attach a single dish image. Returns a manifest record."""
    record = {
        'slug': slug,
        'status': 'pending',
        'media_id': None,
        'role': 'cover',
        'attempted_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'error': None,
    }

    if not image_path.exists():
        record['status'] = 'missing-file'
        record['error'] = f'{image_path} not found'
        log(f'  ✗ {record["error"]}')
        return record

    log(f'uploading {slug} ({image_path.stat().st_size // 1024} KB)...')
    media_id = upload_image(api_base, slug, image_path, alt_text, dry_run=dry_run)
    if not media_id:
        record['status'] = 'upload-failed'
        record['error'] = 'upload returned no media_id'
        return record

    record['media_id'] = media_id

    if not attach_to_dish(api_base, slug, media_id, dry_run=dry_run):
        record['status'] = 'attach-failed'
        record['error'] = 'attach returned non-2xx'
        return record

    record['status'] = 'ok' if not dry_run else 'dry-run'
    return record


def main() -> int:
    parser = argparse.ArgumentParser(description='Upload AI-generated dish images to Gustale.')
    parser.add_argument('--limit', type=int, default=int(os.environ.get('GUSTALE_LIMIT', '0')),
                        help='Process only the first N dishes (default: all)')
    parser.add_argument('--image-dir', default=DEFAULT_IMAGE_DIR,
                        help='Directory containing <slug>.png files')
    parser.add_argument('--api-base', default=os.environ.get('GUSTALE_API_BASE', DEFAULT_API_BASE),
                        help='Gustale API base URL')
    parser.add_argument('--dry-run', action='store_true',
                        default=os.environ.get('GUSTALE_DRY_RUN', '0') == '1',
                        help='Print what would happen, do not upload')
    parser.add_argument('--force', action='store_true',
                        default=os.environ.get('GUSTALE_FORCE', '0') == '1',
                        help='Re-upload even if slug is in manifest')
    args = parser.parse_args()

    image_dir = Path(args.image_dir)
    if not image_dir.is_dir():
        log(f'✗ image dir does not exist: {image_dir}')
        return 1

    slug_paths = sorted(image_dir.glob('*.png'))
    if args.limit:
        slug_paths = slug_paths[: args.limit]
    log(f'found {len(slug_paths)} image files to process')

    if not args.dry_run:
        email = os.environ.get('GUSTALE_EMAIL')
        password = os.environ.get('GUSTALE_PASSWORD')
        if not email or not password:
            log('✗ GUSTALE_EMAIL and GUSTALE_PASSWORD env vars are required (or use --dry-run)')
            return 1
        if not sign_in(args.api_base, email, password):
            return 1
    else:
        log('DRY-RUN mode — no auth needed, no uploads performed')

    existing = load_existing_manifest()
    already_done = {r['slug'] for r in existing if r.get('status') == 'ok'}
    results = list(existing)

    processed = 0
    for image_path in slug_paths:
        slug = image_path.stem
        if slug in already_done and not args.force:
            log(f'↻ {slug} already uploaded, skipping (use --force to re-upload)')
            continue

        alt_text = f'{slug.replace("-", " ").title()} — generative AI food illustration'

        rec = process_one(args.api_base, slug, image_path, alt_text, dry_run=args.dry_run)
        results.append(rec)
        save_manifest(results)
        processed += 1

        # Rate limit: 2 req/sec, but be polite
        time.sleep(RATE_LIMIT_SECONDS)

    log(f'\n=== summary ===')
    log(f'  total processed this run: {processed}')
    log(f'  ok: {sum(1 for r in results if r.get("status") == "ok")}')
    log(f'  dry-run: {sum(1 for r in results if r.get("status") == "dry-run")}')
    log(f'  upload-failed: {sum(1 for r in results if r.get("status") == "upload-failed")}')
    log(f'  attach-failed: {sum(1 for r in results if r.get("status") == "attach-failed")}')
    log(f'  manifest: {MANIFEST_CSV}')

    return 0


if __name__ == '__main__':
    sys.exit(main())
