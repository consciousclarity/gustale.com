/**
 * The real proof: the API's OWN minio module, against the LIVE MinIO,
 * with the override in place.
 *
 * The concern with the `query-string>decode-uri-component` override is
 * that query-string@7 is CommonJS and calls the require() result
 * directly. The patched decode-uri-component is ESM-only, so require()
 * returns a namespace object, not the function.
 *
 * That breaks query-string's PARSER. MinIO only calls STRINGIFY — all
 * five of its call sites — so the parser is unreachable. This exercises
 * the paths the API actually uses, against the real service, with the
 * real credentials.
 *
 * It checks:
 *   - the client constructs
 *   - bucketExists (a live request)
 *   - presignedGetObject (the signing path — this is where
 *     querystring.stringify is used)
 *   - the signed URL actually fetches the object
 */

import { readFileSync } from "node:fs";
import { Client } from "minio";

function loadEnv(file) {
  const env = {};
  let raw;
  try {
    raw = readFileSync(file, "utf-8");
  } catch {
    return env;
  }
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

const env = { ...loadEnv("/home/deploy/gustale.com/.env") };

if (!env.MINIO_ENDPOINT || !env.MINIO_ACCESS_KEY) {
  console.log(
    "[minio-check] the live MinIO env is not readable here — skipping",
  );
  process.exit(0);
}

const endpoint = new URL(env.MINIO_ENDPOINT);
const client = new Client({
  endPoint: endpoint.hostname,
  port: Number(endpoint.port || (endpoint.protocol === "https:" ? 443 : 80)),
  useSSL: endpoint.protocol === "https:",
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

const bucket = env.MINIO_BUCKET_PUBLIC || "gustale-public";
const key = "dishes/moussaka-greek/cover-1536w.webp";

console.log("[minio-check] the endpoint:", endpoint.origin);
console.log("[minio-check] the bucket:", bucket);

// 1. The client constructs and can talk to the service.
try {
  const exists = await client.bucketExists(bucket);
  console.log("[minio-check] bucketExists ->", exists);
} catch (error) {
  console.log("[minio-check] bucketExists THREW:", error.message);
  process.exit(1);
}

// 2. The signing path — this is the one that uses querystring.stringify.
let url;
try {
  url = await client.presignedGetObject(bucket, key, 300);
  console.log("[minio-check] presignedGetObject -> OK");
  console.log(
    "[minio-check] the query:",
    String(url).split("?")[1]?.slice(0, 90),
  );
} catch (error) {
  console.log("[minio-check] presignedGetObject THREW:", error.message);
  process.exit(1);
}

// 3. The signed URL actually fetches the object.
try {
  const response = await fetch(url);
  console.log(
    "[minio-check] the signed GET ->",
    response.status,
    response.headers.get("content-type"),
  );
  if (response.ok) {
    console.log(
      "[minio-check] PASS — the live signed-URL path works with the override",
    );
  } else {
    console.log(
      "[minio-check] FAIL — the signed GET did not return the object",
    );
    process.exit(1);
  }
} catch (error) {
  console.log("[minio-check] the signed GET THREW:", error.message);
  process.exit(1);
}
