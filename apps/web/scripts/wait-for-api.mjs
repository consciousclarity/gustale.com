#!/usr/bin/env node
/**
 * Wait for the API to be reachable before building.
 *
 * Usage: node scripts/wait-for-api.mjs <api-base-url>
 *
 * Polls GET <api-base>/health with a 5s per-request timeout, up to
 * 60 attempts spaced 1s apart. Exits 0 on first 2xx, exits 1 if the
 * deadline expires or a non-recoverable error occurs.
 *
 * Why this exists: Astro's getStaticPaths fetches from the API at
 * build time to enumerate every dish + ingredient page. If the API
 * is briefly unreachable, Astro silently falls back to a single
 * placeholder dish, and we ship a near-empty dist. Gating the build
 * on /health first means flaky-network runs fail fast (~1s) instead
 * of wasting 3+ minutes of retries and still producing garbage.
 */
const url = new URL('/health', process.argv[2]).toString();
const deadline = Date.now() + 60_000;

const tryOnce = async () => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!r.ok) return null;
    return r;
  } catch {
    return null;
  }
};

let attempt = 0;
while (Date.now() < deadline) {
  attempt++;
  const r = await tryOnce();
  if (r) {
    console.log(`API ready after ${attempt} attempt(s) (${url})`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 1_000));
}

console.error(`ERROR: API at ${url} not reachable after 60s`);
process.exit(1);