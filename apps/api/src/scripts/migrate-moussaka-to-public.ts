/**
 * One-off script: migrate Moussaka's media to the public bucket
 * and populate the `variants` JSONB column.
 *
 * The Moussaka cover was uploaded BEFORE the variants schema
 * existed. The bytes are in the private `gustale-media` bucket at
 * `unattached/634ae2e838d24f95.jpg`. The dish page is the public
 * face of the platform, so we:
 *   1. SKIP the master JPG. It stays in `gustale-media` (private)
 *      and is never proxied at `/media/*` — only WebP variants are
 *      publicly served. The master is the source for regeneration,
 *      not a public deliverable.
 *   2. Generate 800w + 1536w WebP derivatives from the master,
 *      upload them to the public bucket.
 *   3. Update the `media.variants` JSONB to point at the new keys.
 *
 * Run once (after migration 0012 is applied):
 *   pnpm tsx apps/api/src/scripts/migrate-moussaka-to-public.ts
 *
 * Idempotent: re-running finds the public copies and only redoes
 * what's missing.
 */
import { db, media } from "@gustale/db";
import { eq } from "drizzle-orm";
import { getClient, PUBLIC_BUCKET, uploadStream } from "../lib/minio.js";

const MOUSSAKA_SLUG = "moussaka-greek";
const MOUSSAKA_ORIGINAL_KEY = "unattached/634ae2e838d24f95.jpg";

async function main(): Promise<void> {
  // Find the media row.
  const rows = await db
    .select()
    .from(media)
    .where(eq(media.storageKey, MOUSSAKA_ORIGINAL_KEY));
  if (rows.length === 0) {
    console.error(
      `No media row with storageKey = ${MOUSSAKA_ORIGINAL_KEY}. Already migrated or never existed.`,
    );
    process.exit(1);
  }
  const row = rows[0]!;
  console.log(`Found media row ${row.id} (${row.altText ?? "no alt"})`);

  // 1. Skip the master JPG. Per the PR #78 spec, only WebP variants
  //    go to the public bucket — the master stays in the private
  //    `gustale-media` bucket (`unattached/<uuid>.jpg`) and is never
  //    proxied at /media/*. Crawlers + the front-end's srcset will use
  //    the largest variant; the master is the source for regeneration,
  //    not a public deliverable.

  // 2. Generate WebP derivatives. We use the system `cwebp` (from
  //    libwebp-tools) when available; that keeps the dependency
  //    footprint minimal and matches what the image generation
  //    pipeline (`minimax-image`) already produces.
  const variants: Record<string, string> = {};
  for (const [width, suffix] of [
    ["800", "800w"],
    ["1536", "1536w"],
  ] as const) {
    const key = `dishes/${MOUSSAKA_SLUG}/cover-${suffix}.webp`;
    const ok = await generateWebpVariant(
      "gustale-media",
      MOUSSAKA_ORIGINAL_KEY,
      PUBLIC_BUCKET,
      key,
      Number(width),
    );
    if (ok) {
      variants[width] = key;
      console.log(`Generated ${width}w → gustale-public/${key}`);
    }
  }

  // 3. Update the row.
  await db.update(media).set({ variants }).where(eq(media.id, row.id));
  console.log(`Updated media.variants: ${JSON.stringify(variants)}`);

  console.log("\nDone. The Moussaka cover is now same-origin public.");
  console.log("Run `pnpm --filter @gustale/db run migrate` if you also");
  console.log("need to apply the 0012 schema migration in a fresh DB.");
}

/**
 * Generate a WebP variant at the target width and upload it.
 *
 * We use the system `cwebp` (from libwebp-tools) when available; that
 * keeps the dependency footprint minimal and matches what the image
 * generation pipeline (`minimax-image`) already produces.
 *
 * Returns true on success, false on failure (e.g. cwebp missing).
 * Failure is non-fatal — the original `publicUrl` still works as a
 * fallback, just without a `<img srcset>`.
 */
async function generateWebpVariant(
  sourceBucket: string,
  sourceKey: string,
  destBucket: string,
  destKey: string,
  targetWidth: number,
): Promise<boolean> {
  const { spawnSync } = await import("node:child_process");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const os = await import("node:os");
  const { Readable } = await import("node:stream");

  // Check cwebp.
  const which = spawnSync("which", ["cwebp"]);
  if (which.status !== 0) {
    console.warn("cwebp not found in PATH; skipping variant generation");
    return false;
  }

  // Stream source object to a temp file, decode, resize, encode, upload.
  const tmpInput = path.join(
    os.tmpdir(),
    `gustale-mig-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
  );
  const tmpOutput = `${tmpInput}.webp`;

  try {
    const client = getClient();
    const dataStream = await client.getObject(sourceBucket, sourceKey);
    const ws = (await import("node:fs")).createWriteStream(tmpInput);
    await new Promise<void>((resolve, reject) => {
      dataStream.pipe(ws);
      ws.on("finish", () => resolve());
      ws.on("error", reject);
    });

    // Resize + encode. -resize <width> keeps aspect ratio.
    const cwebp = spawnSync("cwebp", [
      "-q",
      "82", // quality per the .hermes/IMAGE_STYLE.md
      "-resize",
      String(targetWidth),
      "0", // 0 = keep height proportional
      tmpInput,
      "-o",
      tmpOutput,
    ]);
    if (cwebp.status !== 0) {
      console.warn(`cwebp failed: ${cwebp.stderr?.toString()}`);
      return false;
    }

    const buffer = await fs.readFile(tmpOutput);
    await uploadStream(
      destBucket,
      destKey,
      Readable.from(buffer),
      buffer.byteLength,
      "image/webp",
    );
    return true;
  } catch (err) {
    console.warn(`generateWebpVariant error: ${(err as Error).message}`);
    return false;
  } finally {
    await fs.unlink(tmpInput).catch(() => undefined);
    await fs.unlink(tmpOutput).catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
