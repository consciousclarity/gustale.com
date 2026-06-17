/**
 * MinIO / S3 client wrapper for gustale media storage.
 *
 * Two buckets are configured (env-driven):
 *   - `gustale-public`  — anonymous-download. CDN-fronted reads (public gallery
 *                         images served directly by Caddy/nginx).
 *   - `gustale-media`   — private. Original uploads, accessed only via signed
 *                         URLs (15-min expiry). Thumbnails/derivatives can live
 *                         here too.
 *
 * The MinIO client is created lazily on first use and reused for the process
 * lifetime. The underlying `minio` package manages its own connection pool.
 *
 * Why a wrapper instead of using the raw client everywhere:
 *   - Single source of truth for the bucket/env wiring (single set of env
 *     vars, single retry policy, single error mapping).
 *   - Routes never see `Client` — they get narrow verbs (upload, presign,
 *     stat, remove) so route code stays focused on business logic.
 *   - All MinIO failures become `MediaStorageError`, which the centralized
 *     error handler maps to a structured 500 (with traceId). Routes don't
 *     need to know about AWS error shapes.
 */
import { Readable } from 'node:stream';
import { Client as MinioClient } from 'minio';
import { env } from '../env.js';

// Derive the return type of putObject without importing UploadedObjectInfo
// (it's not re-exported from the package root in minio@8).
type PutObjectResult = Awaited<ReturnType<MinioClient['putObject']>>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown by all storage helpers on transient or unrecoverable failures.
 * Routes catch this (or rely on the centralized handler) and return a 5xx.
 *
 * `cause` carries the original error for Pino structured logging.
 */
export class MediaStorageError extends Error {
  public readonly code: string;
  public override readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'MediaStorageError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Client (lazy singleton)
// ---------------------------------------------------------------------------

let _client: MinioClient | null = null;

/**
 * Return the process-wide MinIO client. Created on first use.
 *
 * The endpoint URL is stripped of any trailing slash (MinIO is strict about
 * this), and the port is parsed separately (MinIO SDK expects `useSSL` + port,
 * not a full URL).
 */
export function getClient(): MinioClient {
  if (_client) return _client;

  const endpoint = new URL(env.MINIO_ENDPOINT);
  const useSSL = endpoint.protocol === 'https:';
  const port = endpoint.port ? Number(endpoint.port) : useSSL ? 443 : 80;

  _client = new MinioClient({
    endPoint: endpoint.hostname,
    port,
    useSSL,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  });

  return _client;
}

// ---------------------------------------------------------------------------
// Bucket helpers
// ---------------------------------------------------------------------------

export const PUBLIC_BUCKET = env.MINIO_BUCKET_PUBLIC; // 'gustale-public'
export const PRIVATE_BUCKET = env.MINIO_BUCKET_PRIVATE; // 'gustale-media'

/**
 * Returns true if both buckets exist. Used by health/diagnostic endpoints
 * and by the boot-time check (see `ensureBuckets`).
 */
export async function bucketsExist(): Promise<{ publicBucket: boolean; privateBucket: boolean }> {
  const client = getClient();
  try {
    const [pub, priv] = await Promise.all([
      client.bucketExists(PUBLIC_BUCKET),
      client.bucketExists(PRIVATE_BUCKET),
    ]);
    return { publicBucket: pub, privateBucket: priv };
  } catch (err) {
    throw new MediaStorageError('bucket_check_failed', 'Could not check bucket existence', err);
  }
}

/**
 * Idempotently create the configured buckets if they don't exist.
 * Called once at API boot. Safe to call repeatedly.
 */
export async function ensureBuckets(): Promise<void> {
  const client = getClient();
  try {
    const exists = await bucketsExist();
    if (!exists.publicBucket) {
      await client.makeBucket(PUBLIC_BUCKET, 'us-east-1');
    }
    if (!exists.privateBucket) {
      await client.makeBucket(PRIVATE_BUCKET, 'us-east-1');
    }
  } catch (err) {
    throw new MediaStorageError('bucket_create_failed', 'Could not ensure buckets', err);
  }
}

// ---------------------------------------------------------------------------
// Storage verbs
// ---------------------------------------------------------------------------

/**
 * Upload a stream to the given bucket at `key`.
 *
 * `size` is required by MinIO (it needs Content-Length up front for streaming
 * uploads). `mimeType` is stored as the Content-Type on the resulting object
 * so the browser serves it correctly when fetched directly (public bucket)
 * or via signed URL (private bucket).
 *
 * Caller is responsible for:
 *   - Validating mimeType against the allow-list for this endpoint.
 *   - Generating a collision-resistant `key` (UUID + extension is the common
 *     pattern; see `generateStorageKey`).
 *   - Closing `stream` if they own it.
 */
export async function uploadStream(
  bucket: string,
  key: string,
  stream: Readable,
  size: number,
  mimeType: string,
): Promise<{ etag: string; versionId: string | null; key: string; bucket: string }> {
  const client = getClient();
  try {
    const info: PutObjectResult = await client.putObject(bucket, key, stream, size, {
      'Content-Type': mimeType,
    });
    return { etag: info.etag, versionId: info.versionId, key, bucket };
  } catch (err) {
    throw new MediaStorageError('upload_failed', `Upload to ${bucket}/${key} failed`, err);
  }
}

/**
 * Generate a short-lived signed URL for downloading a private object.
 *
 * `expirySeconds` defaults to 15 minutes — long enough for a single page
 * render with retry, short enough that leaked URLs are useless.
 */
export async function presignGet(
  bucket: string,
  key: string,
  expirySeconds = 15 * 60,
): Promise<string> {
  const client = getClient();
  try {
    return await client.presignedGetObject(bucket, key, expirySeconds);
  } catch (err) {
    throw new MediaStorageError('presign_failed', `Could not presign GET for ${bucket}/${key}`, err);
  }
}

/**
 * Generate a short-lived signed URL for direct browser uploads.
 *
 * Not used by the v1 upload route (we proxy through the API), but exported
 * so the front-end can switch to direct-to-bucket uploads later without
 * touching this file.
 */
export async function presignPut(
  bucket: string,
  key: string,
  expirySeconds = 15 * 60,
): Promise<string> {
  const client = getClient();
  try {
    return await client.presignedPutObject(bucket, key, expirySeconds);
  } catch (err) {
    throw new MediaStorageError('presign_put_failed', `Could not presign PUT for ${bucket}/${key}`, err);
  }
}

/**
 * Get metadata about an object (size, content-type, last-modified, etag).
 * Throws `MediaStorageError('not_found', …)` if the object doesn't exist
 * so routes can map to a clean 404.
 */
export async function statObject(
  bucket: string,
  key: string,
): Promise<{
  size: number;
  contentType: string;
  lastModified: Date;
  etag: string;
}> {
  const client = getClient();
  try {
    const stat = await client.statObject(bucket, key);
    return {
      size: stat.size,
      contentType: stat.metaData?.['content-type'] ?? 'application/octet-stream',
      lastModified: stat.lastModified,
      etag: stat.etag,
    };
  } catch (err) {
    // The minio client throws an Error with `code: 'NoSuchKey'` when the
    // object doesn't exist. Re-wrap as a not_found so routes can 404 cleanly.
    const code = (err as { code?: string }).code;
    if (code === 'NoSuchKey' || code === 'NotFound') {
      throw new MediaStorageError('not_found', `Object ${bucket}/${key} does not exist`, err);
    }
    throw new MediaStorageError('stat_failed', `Could not stat ${bucket}/${key}`, err);
  }
}

/**
 * Delete an object. Idempotent: returns `false` if the object didn't exist.
 *
 * Used by the eventual media-management endpoint (delete a media row +
 * remove its attachment + delete the underlying object).
 */
export async function removeObject(bucket: string, key: string): Promise<boolean> {
  const client = getClient();
  try {
    await client.removeObject(bucket, key);
    return true;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'NoSuchKey' || code === 'NotFound') {
      return false;
    }
    throw new MediaStorageError('remove_failed', `Could not delete ${bucket}/${key}`, err);
  }
}

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

/**
 * Generate a collision-resistant storage key.
 *
 * Pattern: `<prefix>/<random>.<ext>` — the random part is a 16-hex-char
 * string from `crypto.randomUUID` (truncated). The extension is derived
 * from the mime type so the URL is content-addressable-ish.
 *
 * Examples:
 *   generateStorageKey('dishes/moussaka-greek', 'image/jpeg') -> 'dishes/moussaka-greek/abc123…def0.jpg'
 *   generateStorageKey('ingredients/tomato', 'image/png')     -> 'ingredients/tomato/789012…c3a1.png'
 *
 * Note: the existing `moussaka-greek/cover.jpg` row in the DB does NOT
 * follow this pattern (no random suffix). That's fine — it's the legacy
 * pre-upload-API seed. New uploads always get a random suffix.
 */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

export function generateStorageKey(prefix: string, mimeType: string): string {
  const ext = MIME_TO_EXT[mimeType.toLowerCase()] ?? 'bin';
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  // Strip trailing slash from prefix if caller passed one.
  const cleanPrefix = prefix.replace(/\/+$/, '');
  return `${cleanPrefix}/${random}.${ext}`;
}