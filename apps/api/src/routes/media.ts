/**
 * Media upload + signed-URL routes — Phase 7d.
 *
 * - POST /api/media/upload    upload a file (multipart), store in MinIO,
 *                             insert `media` row, return the new media id.
 * - GET  /api/media/:id/signed-url  return a 15-min presigned GET URL for
 *                                   downloading the private bytes (or the
 *                                   public URL for items in the public bucket).
 *
 * Route-ordering note (P27): static sibling (`/upload`) is registered FIRST,
 * the parametric sibling (`/:id/signed-url`) second.
 *
 * Auth: upload requires authenticated user (any role, including contributor).
 * Signed-URL fetch is open for now — gallery is a public surface. If we add
 * private-restriction later, gate this on requireUser + ownership check.
 *
 * Files are stored in `gustale-media` (private). The browser always fetches
 * via a short-lived signed URL. We could also write to `gustale-public`
 * for CDN-fronted reads, but for v1 we keep everything in private so the
 * signed-URL endpoint is the single read path — easier to reason about
 * access control.
 */
import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, media } from '@gustale/db';
import { httpError } from '../errors.js';
import {
  PRIVATE_BUCKET,
  generateStorageKey,
  presignGet,
  removeObject,
  uploadStream,
} from '../lib/minio.js';

// ─── Constants ───────────────────────────────────────────────────────────

/**
 * Allowed MIME types. We accept JPEG/PNG/WebP/AVIF/GIF — the common formats
 * browsers can render and the ones documented as Wikipedia-friendly.
 *
 * Adding new types means: extend this allow-list, extend the extension map
 * in lib/minio.ts:generateStorageKey, and update the DishDetail renderer
 * if the format isn't browser-native.
 */
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

/**
 * Hard upload limit. 20 MB matches nginx's `client_max_body_size` (which we
 * also need to set on the gustale-api nginx in front of the container if
 * we ever put one there — for now Fastify receives directly).
 *
 * Reject BEFORE buffering the body so a 100 MB attack doesn't fill memory.
 */
const MAX_BYTES = 20 * 1024 * 1024;

/** Signed-URL expiry. Long enough for one page render + retry, short enough
 *  that leaked URLs are useless. */
const SIGNED_URL_TTL_SECONDS = 15 * 60;

// ─── Zod schemas ──────────────────────────────────────────────────────────

/**
 * Optional text fields the upload route accepts alongside the file part.
 * Multipart form fields: `file` (the bytes), `altText` (a11y caption),
 * `credit` (photographer/source), `license` (e.g. 'CC-BY-SA-4.0').
 *
 * `targetType` + `targetSlug` are convenience: caller can upload + attach
 * in one call. The upload route itself only stores the bytes and writes the
 * `media` row — attachment is a separate route (POST /api/dishes/:slug/media).
 * Keeping these fields out of the upload route for now; we can add them
 * later without breaking the API.
 */
const uploadFieldsSchema = z.object({
  altText: z.string().max(500).optional(),
  credit: z.string().max(200).optional(),
  license: z.string().max(100).optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Detect mime type from filename extension as a last resort. The multipart
 * `mimetype` field is client-controlled and can lie, so this is belt-and-
 * suspenders. The real defense is the ALLOWED_MIME allow-list at the top
 * of the file — we never trust what the browser claims.
 *
 * Not used right now, but exported so the same logic can be reused when
 * we add a `POST /api/dishes/:slug/media` attachment route that needs to
 * display mime-type for cards/previews.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectMimeFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.gif')) return 'image/gif';
  return null;
}

/**
 * Convert a Buffer to a Node Readable stream for the MinIO SDK.
 *
 * The multipart plugin's `toBuffer()` collects the entire file in memory.
 * For files up to 20 MB this is fine — well within typical Node heap
 * allocations. If we ever need bigger files, swap to streaming:
 * `request.file()` (the async iterator version) which gives a `MultipartFile`
 * whose `.file` is already a Readable stream.
 */
function bufferToStream(buffer: Buffer): Readable {
  return Readable.from(buffer);
}

// ─── Route registration ──────────────────────────────────────────────────

export const registerMediaRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ─── POST /api/media/upload ──────────────────────────────────────────
  // Authenticated upload. Any contributor+ can upload (we may tighten to
  // moderator+ later if abuse becomes a problem). The bytes go to the
  // private bucket; signed URLs gate every read.
  //
  // Static path — must register BEFORE the parametric /:id/signed-url
  // route below (P27).
  app.post('/api/media/upload', async (request, reply) => {
    const user = await app.requireUser(request);

    // 1. Validate metadata fields up front. The multipart parser runs
    //    AFTER zod, so we validate the body fields manually here.
    const fields: Record<string, string> = {};
    let file: Awaited<ReturnType<typeof request.file>> | null = null;
    try {
      // request.parts() yields MultipartFile and MultipartValue in order.
      // We accept only one file (the first) and accumulate string fields.
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          // First file wins. Additional file parts are rejected to keep
          // the API surface simple (one image per upload).
          if (file === null) file = part;
          // Drain the rest of the stream so multipart doesn't hang.
          await part.toBuffer();
        } else {
          fields[part.fieldname] = String(part.value ?? '');
        }
      }
    } catch (err) {
      throw httpError(400, 'malformed_multipart', 'Could not parse multipart body', {
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    if (file === null) {
      throw httpError(400, 'missing_file', 'Upload must include a `file` part');
    }

    // 2. Validate mime. We use the declared mimetype — the bucket policy +
    //    the lack of `Content-Disposition: inline` headers means a malicious
    //    mimetype just gets the wrong Content-Type on download, not a code
    //    execution path.
    const mimeType = file.mimetype.toLowerCase();
    if (!ALLOWED_MIME.has(mimeType)) {
      throw httpError(
        415,
        'unsupported_media_type',
        `Unsupported mime type: ${mimeType}. Allowed: ${Array.from(ALLOWED_MIME).join(', ')}`,
        { fields: ['file'] },
      );
    }

    // 3. Validate metadata fields.
    const meta = uploadFieldsSchema.parse(fields);

    // 4. Read the file into memory and enforce the size limit.
    const buffer = await file.toBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      throw httpError(
        413,
        'payload_too_large',
        `File exceeds ${MAX_BYTES} bytes (got ${buffer.byteLength})`,
      );
    }
    if (buffer.byteLength === 0) {
      throw httpError(400, 'empty_file', 'Uploaded file is empty');
    }

    // 5. Build a collision-resistant storage key. Prefix `unattached/` for
    //    uploads that haven't been bound to a dish yet — makes them easy
      //    to find and clean up if they end up orphaned.
    const key = generateStorageKey('unattached', mimeType);

    // 6. Stream to MinIO. The buffer is small enough that Readable.from
    //    is the simplest path; if we ever raise MAX_BYTES, switch to a
    //    disk-backed temp file instead.
    const uploadResult = await uploadStream(
      PRIVATE_BUCKET,
      key,
      bufferToStream(buffer),
      buffer.byteLength,
      mimeType,
    );

    // 7. Write the DB row. `uploadedBy` comes from the session (no body
    //    field — see design decision in SHARED_STATE/TASKS).
    try {
      const inserted = await db
        .insert(media)
        .values({
          storageKey: uploadResult.key,
          mimeType,
          byteSize: buffer.byteLength,
          // width/height/duration: not extracted in v1. Would need sharp or
          // ffmpeg in a worker process; out of scope for the upload endpoint.
          altText: meta.altText ?? null,
          credit: meta.credit ?? null,
          license: meta.license ?? null,
          uploadedBy: user.id,
        })
        .returning({
          id: media.id,
          storageKey: media.storageKey,
          mimeType: media.mimeType,
          byteSize: media.byteSize,
          uploadedAt: media.uploadedAt,
        });
      const row = inserted[0];
      if (!row) {
        throw new Error('Media insert returned no rows');
      }
      return reply.status(201).send({
        media: {
          id: row.id,
          storageKey: row.storageKey,
          mimeType: row.mimeType,
          byteSize: row.byteSize,
          altText: meta.altText ?? null,
          credit: meta.credit ?? null,
          license: meta.license ?? null,
          uploadedAt: row.uploadedAt.toISOString(),
          uploadedBy: user.id,
        },
      });
    } catch (err) {
      // If the DB insert fails after the MinIO upload succeeded, clean up
      // the orphaned object so we don't leak storage. Best-effort — if
      // removeObject also fails, log loudly and the next sweep can pick
      // up unattached/ keys older than 1 hour.
      request.log.error({ err, key }, 'media insert failed; cleaning up orphan');
      void removeObject(PRIVATE_BUCKET, key).catch((cleanupErr) => {
        request.log.error({ err: cleanupErr, key }, 'orphan cleanup failed');
      });
      throw err;
    }
  });

  // ─── GET /api/media/:id/signed-url ───────────────────────────────────
  // Returns a 15-min presigned GET URL for the requested media.
  //
  // Open access for now (gallery is a public surface). When we add
  // private/restricted media, gate on requireUser + a permissions check.
  //
  // Parametric path — registered AFTER the static sibling above (P27).
  app.get('/api/media/:id/signed-url', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const rows = await db
      .select({
        storageKey: media.storageKey,
        mimeType: media.mimeType,
        byteSize: media.byteSize,
      })
      .from(media)
      .where(eq(media.id, id))
      .limit(1);
    if (rows.length === 0) {
      throw httpError(404, 'not_found', 'Media not found');
    }
    const row = rows[0]!;

    const url = await presignGet(PRIVATE_BUCKET, row.storageKey, SIGNED_URL_TTL_SECONDS);

    return {
      url,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      mimeType: row.mimeType,
      byteSize: row.byteSize,
    };
  });
};