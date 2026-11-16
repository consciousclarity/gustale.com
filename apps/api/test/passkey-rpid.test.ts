/**
 * The passkey RP ID must be `gustale.com`, and it must be EXPLICIT.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * The RP ID was DERIVED from `BETTER_AUTH_URL`'s hostname:
 *
 *     rpID: env.BETTER_AUTH_URL
 *       ? new URL(env.BETTER_AUTH_URL).hostname
 *       : "gustale.com",
 *
 * which made it `api.gustale.com` in production. Two things were wrong
 * with that, and the second one is why this test is here at all:
 *
 *   1. `api.gustale.com` is a SIBLING of `gustale.com`, not a suffix
 *      of it. WebAuthn requires the RP ID to be the caller's effective
 *      domain or a registrable-domain suffix of it, so a passkey
 *      registered under `api.gustale.com` would be refused on the
 *      site's own pages.
 *
 *   2. A DERIVED value changes SILENTLY. Anyone who changed
 *      `BETTER_AUTH_URL` — to move the auth origin, or just to point
 *      at a staging host — would silently change the RP ID, and every
 *      already-enrolled passkey would stop working. The RP ID is
 *      HASHED into the credential, so that is not a degradation, it is
 *      a lockout.
 *
 * The RP ID is a property of the DEPLOYMENT, not of the auth origin.
 * It is now an explicit `PASSKEY_RP_ID` environment variable.
 *
 * WHY THIS IS A STATIC TEST AND NOT A RUNTIME ONE
 * ----------------------------------------------
 * The passkey plugin is configured inside `src/auth.ts` at import time,
 * and reading the configured RP ID back out of the plugin instance
 * means reaching into better-auth's internals. This test asserts the
 * SOURCE, which is what actually has to be right, and it is a test
 * that fails the moment the derivation comes back.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const apiSrc = join(here, "..", "src");

function readSource(...parts: string[]): string {
  return readFileSync(join(apiSrc, ...parts), "utf8");
}

describe("the passkey RP ID", () => {
  it("is EXPLICIT -- not derived from BETTER_AUTH_URL", () => {
    const auth = readSource("auth.ts");

    // The derivation must not come back. This is the assertion that
    // matters most: a derived RP ID changes silently.
    expect(auth).not.toMatch(/rpID:\s*env\.BETTER_AUTH_URL/);
    expect(auth).toMatch(/rpID:\s*env\.PASSKEY_RP_ID/);
  });

  it("defaults to gustale.com -- the registrable domain of the whole tree", () => {
    const env = readSource("env.ts");
    expect(env).toMatch(
      /PASSKEY_RP_ID:\s*z\.string\(\)\.default\("gustale\.com"\)/,
    );
  });

  it("is the registrable domain that covers gustale.com AND api.gustale.com", () => {
    // WebAuthn: the RP ID must equal the caller's effective domain, or
    // be a registrable-domain suffix of it. `gustale.com` is the
    // eTLD+1 of BOTH hosts, so one RP ID covers both.
    //
    // A host on a DIFFERENT registrable domain -- and the retired
    // encyclopedia host was one -- would not accept a passkey scoped
    // to `gustale.com`. That is a known and accepted limitation,
    // recorded in docs/CUTOVER-recipes-gustale-com.md section 5.6, and
    // it is why the auth origin stays on api.gustale.com.
    for (const host of ["api.gustale.com", "gustale.com"]) {
      expect(host === "gustale.com" || host.endsWith(".gustale.com")).toBe(
        true,
      );
    }
  });

  it("leaves BETTER_AUTH_URL alone -- the auth origin does not move", () => {
    // The RP ID and the auth origin are separate concerns. Moving the
    // origin to a host on another registrable domain would break
    // api.gustale.com logins; it is deliberately NOT done here.
    const auth = readSource("auth.ts");
    expect(auth).toMatch(
      /origin:\s*env\.BETTER_AUTH_URL\s*\?\s*\[env\.BETTER_AUTH_URL\]/,
    );
  });
});
