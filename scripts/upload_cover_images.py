#!/usr/bin/env python3
"""Upload the cover images, optimised, with their attribution.

WHAT THIS DOES

Takes the plan from `fetch_cover_images.py` and, for each usable
image:

  1. downloads the original from Wikimedia Commons;
  2. produces TWO optimised versions — 800w and 1536w — as WebP;
  3. uploads both to the `gustale-public` bucket at
     `dishes/<slug>/cover-<width>w.webp`;
  4. writes the `media` row and the `media_attachments` row, with
     the licence, the credit and the alt text.

THE OPTIMISATION

WebP at quality 82, which is the quality the existing 11 covers
were produced at and which keeps a photograph of food visually
clean while cutting the bytes roughly in half against the JPEG
original. Both widths are produced because the site's `<img>` tag
builds a `srcset` from the `variants` map, and a browser that
supports srcset picks the width that fits rather than always
taking the largest.

AVIF is NOT used for the cover variants. The site's media contract
is WebP variants, the `<picture>` markup that would pick AVIF does
not exist, and adding an AVIF variant without a `<picture>` element
would be a file nobody requests. WebP at 800w/1536w is what the
front-end actually consumes, and it is what gets served.

THE ATTRIBUTION IS NOT OPTIONAL

The licence is stored on the `media` row (`license`) and the credit
line — author, source and the Commons file page — is stored on
`credit`. The front-end renders both on the dish page. An image
whose licence could not be read is never uploaded: the fetch step
refuses it, and this step refuses anything in the plan that is not
`status: ok`.

Usage:
    python3 scripts/upload_cover_images.py --report
    python3 scripts/upload_cover_images.py --upload [--limit N]
"""

from __future__ import annotations

import argparse
import io
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parent.parent
PLAN_FILE = REPO / "data" / "cover_images.json"

UA = "gustale-reference-work/1.0 (https://gustale.com)"

# The widths the site's `variants` map uses. These are the two the
# existing covers have, and the two the front-end's srcset builder
# expects.
WIDTHS = [800, 1536]

# The WebP quality. 82 is what the existing covers were made at.
QUALITY = 82

ENV_FILE = "/home/gustale/.hermes/.env"


def load_env() -> dict:
    """The MinIO credentials.

    They come from the API container's environment, because that is
    the same credential the running API uses — and the images have to
    land in the bucket the API reads from.
    """
    env = dict(os.environ)
    out = subprocess.run(
        ["docker", "exec", "gustale-api", "printenv"],
        capture_output=True,
        text=True,
    )
    if out.returncode == 0:
        for line in out.stdout.splitlines():
            if "=" in line:
                key, value = line.split("=", 1)
                env.setdefault(key, value)
    return env


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def optimise(data: bytes, width: int) -> bytes:
    """One optimised WebP at the given width.

    The image is cropped to the target aspect ratio rather than
    squashed: a cover that is 3:4 on a 16:9 card would otherwise be
    letterboxed with a black band, which reads as a broken image.
    The crop is centred, which for a photograph of a dish keeps the
    plate in the frame.
    """
    source = Image.open(io.BytesIO(data))
    source = source.convert("RGB")

    target_ratio = 3 / 4
    width_px, height_px = source.size
    current_ratio = width_px / height_px

    if current_ratio > target_ratio:
        # Too wide — crop the sides.
        new_width = int(height_px * target_ratio)
        left = (width_px - new_width) // 2
        source = source.crop((left, 0, left + new_width, height_px))
    elif current_ratio < target_ratio:
        # Too tall — crop the top and bottom, keeping a little more
        # of the top, where the subject of a food photograph is.
        new_height = int(width_px / target_ratio)
        top = int((height_px - new_height) * 0.35)
        source = source.crop((0, top, width_px, top + new_height))

    if source.width > width:
        height = max(1, round(source.height * width / source.width))
        source = source.resize((width, height), Image.LANCZOS)

    buffer = io.BytesIO()
    source.save(buffer, format="WEBP", quality=QUALITY, method=4)
    return buffer.getvalue()


def mc(env: dict, *args: str, capture: bool = True) -> subprocess.CompletedProcess:
    """Run `mc` inside the MinIO container against the local alias."""
    host = (
        f"http://{env['MINIO_ACCESS_KEY']}:{env['MINIO_SECRET_KEY']}"
        f"@{env.get('MINIO_HOST', '127.0.0.1')}:{env.get('MINIO_PORT', '9000')}"
    )
    return subprocess.run(
        ["docker", "exec", "-i", "-e", f"MC_HOST_local={host}",
         "shared-minio", "mc", *args],
        capture_output=capture,
        text=True,
    )


def upload_bytes(env: dict, blob: bytes, key: str, content_type: str) -> None:
    """Upload bytes to the public bucket.

    `mc` runs INSIDE the MinIO container, so it cannot see a file on
    the host's filesystem — and it does not accept stdin either
    ("Unable to prepare URL for copying. Requested path `/-` not
    found"). So the bytes go into the container with `docker cp`, and
    `mc cp` reads them from there.

    The CONTENT TYPE has to be set explicitly. `mc cp` guesses from
    the file's extension, and the temp file it copies from has a
    `.bin` name — so without the flag every image was stored as
    `application/octet-stream`, and the browser was told to download
    a WebP rather than to render it. The flag is `--attr
    "Content-Type=..."`.
    """
    tmp_name = f"/tmp/gustale-upload-{os.getpid()}-{abs(hash(key))}.bin"
    host_path = Path(tmp_name)

    # The bytes have to exist on the HOST first: `docker cp` reads
    # from the host filesystem into the container's.
    host_path.write_bytes(blob)

    copy_in = subprocess.run(
        ["docker", "cp", str(host_path), f"shared-minio:{tmp_name}"],
        capture_output=True,
        text=True,
    )
    if copy_in.returncode != 0:
        host_path.unlink(missing_ok=True)
        raise RuntimeError(f"docker cp failed: {copy_in.stderr.strip()[:200]}")

    try:
        result = mc(
            env,
            "cp",
            "--attr", f"Content-Type={content_type}",
            tmp_name,
            f"local/gustale-public/{key}",
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"the upload failed: {result.stderr.strip()[:200]}"
            )
    finally:
        subprocess.run(
            ["docker", "exec", "shared-minio", "rm", "-f", tmp_name],
            capture_output=True,
        )
        host_path.unlink(missing_ok=True)


def alt_text_for(record: dict) -> str:
    """The alt text.

    The alt text describes the PICTURE for a reader who cannot see
    it, and it names the dish — the dish is what the picture is of,
    and the page's reader came for the dish. The Commons description
    is used when it is present and sane, because it is written by the
    photographer about their own photograph.

    "Sane" is doing real work here. A Commons `ImageDescription` is
    often the uploader's note about the dish rather than about the
    photograph — "Acarajé: Baiana Claudia (http://mais.uol.com.br/
    acarajedaclaudia) - Quitute Elaborado pelas Afro-descendentes" —
    which is a caption with a bare URL in it. It is not a usable
    alt text: it does not describe the picture, and a URL in an alt
    attribute is noise. So a description carrying a URL, or reading
    like a caption with a name and a title in it, is not used.
    """
    description = (record.get("description") or "").strip()
    name = record["name"]

    # A URL in the description means it is the uploader's note.
    if "http" in description.lower():
        description = ""
    # A caption with a dash between a name and a title ("Acarajé: -
    # Baiana Claudia - ...").
    if description.count(" - ") >= 2:
        description = ""
    # Too long to be a caption.
    if len(description) > 200:
        description = ""

    if description:
        cleaned = description.rstrip(".")
        return f"{name}: {cleaned}"

    return f"{name}, a photograph of the dish"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upload", action="store_true", help="upload and write the rows")
    parser.add_argument("--report", action="store_true", help="report on the plan")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    plan = json.loads(PLAN_FILE.read_text())
    usable = [r for r in plan if r.get("status") == "ok"]
    if args.limit:
        usable = usable[: args.limit]

    if not args.upload:
        skipped = [r for r in plan if r.get("status") == "skipped"]
        print("=" * 70)
        print(f"IMAGE PLAN — {len(usable)} usable, {len(skipped)} skipped")
        print("=" * 70)
        licences: dict[str, int] = {}
        for r in usable:
            licences[r["licence"]] = licences.get(r["licence"], 0) + 1
        for name, count in sorted(licences.items(), key=lambda kv: -kv[1]):
            print(f"  {count:3d}  {name}")
        print(f"\n  {len(skipped)} images will be skipped — no attributable licence.")
        for r in skipped:
            print(f"    {r['slug']}: {r['reason']}")
        return 0

    env = load_env()
    uploaded = 0
    failed: list[tuple[str, str]] = []

    for index, record in enumerate(usable, start=1):
        slug = record["slug"]
        try:
            data = download(record["image_url"])
            variants: dict[str, str] = {}
            blobs: dict[str, bytes] = {}
            for width in WIDTHS:
                blob = optimise(data, width)
                key = f"dishes/{slug}/cover-{width}w.webp"
                upload_bytes(env, blob, key, "image/webp")
                variants[str(width)] = key
                blobs[str(width)] = blob
        except Exception as exc:  # noqa: BLE001
            failed.append((slug, str(exc)[:200]))
            print(f"  [{index}/{len(usable)}] {slug}: FAILED — {exc}"[:200])
            continue

        # The database rows.
        #
        # The `media` row carries the licence, the credit and the
        # alt text; the `media_attachments` row attaches it to the
        # dish as the cover. The storage key of the row is the
        # largest variant, which is what `pickPublicUrl` expects for
        # the fallback `src`.
        master_key = variants[str(max(WIDTHS))]
        master_blob = blobs[str(max(WIDTHS))]
        master_width = max(WIDTHS)
        # The height of the optimised master, from the blob itself.
        master_height = Image.open(io.BytesIO(master_blob)).height
        alt = alt_text_for(record)
        sql = (
            "with ins as ("
            "  insert into media (storage_key, mime_type, byte_size, width, height, "
            "       alt_text, credit, license, uploaded_by, variants) "
            "  values (:'key', 'image/webp', :'size', :'width', :'height', "
            "       :'alt', :'credit', :'licence', 'hermes-agent', "
            "       cast(:'variants' as jsonb)) "
            "  returning id"
            ") "
            "insert into media_attachments (target_type, target_id, media_id, role, position) "
            "select 'dish', d.id, ins.id, 'cover', 0 from dishes d, ins "
            "where d.slug = :'slug' and d.status = 'published' "
            "  and not exists (select 1 from media_attachments ma "
            "                   where ma.target_id = d.id and ma.role = 'cover');"
        )
        result = subprocess.run(
            ["bash", str(REPO / "scripts" / "dbq.sh"),
             "-v", f"key={master_key}",
             "-v", f"size={len(master_blob)}",
             "-v", f"width={master_width}",
             "-v", f"height={master_height}",
             "-v", f"alt={alt}",
             "-v", f"credit={record['credit']}",
             "-v", f"licence={record['licence']}",
             "-v", f"variants={json.dumps(variants)}",
             "-v", f"slug={slug}",
             sql],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            failed.append((slug, result.stderr.strip()[:200]))
            print(f"  [{index}/{len(usable)}] {slug}: THE ROW FAILED")
            continue

        uploaded += 1
        print(f"  [{index}/{len(usable)}] {slug}: uploaded "
              f"({record['licence']}) — {len(variants)} variants")

    print()
    print("=" * 70)
    print(f"UPLOADED {uploaded} of {len(usable)}")
    if failed:
        print(f"FAILED {len(failed)}:")
        for slug, why in failed:
            print(f"  {slug}: {why}")
    print("=" * 70)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
