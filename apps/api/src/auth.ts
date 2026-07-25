/**
 * Better-auth configuration.
 *
 * Mounted as a Fastify plugin at /api/auth/* (see plugins/auth.ts).
 * All client-facing endpoints (sign-in, sign-up, OAuth callback, etc.) live under this prefix.
 *
 * Reference: https://better-auth.com/docs/installation
 *
 * Design notes:
 *  - Email+password uses better-auth's built-in Argon2id hashing.
 *  - Google OAuth is enabled (single provider for MVP). Add Apple/GitHub later.
 *  - Magic links via Resend (free tier, 3k/month).
 *  - Passkeys enabled. Relying party name matches the production domain.
 *  - Roles: visitor (default) → contributor (after first contribution) → moderator (invited) → admin.
 *    Better-auth stores the role on the user table (we added `role` in schema/auth.ts).
 */

import { passkey } from "@better-auth/passkey";
import { db, schema } from "@gustale/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { env } from "./env.js";

export const auth = betterAuth({
  appName: "Gustale",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      passkey: schema.passkey,
      rateLimit: schema.rateLimit,
    },
  }),

  emailAndPassword: {
    enabled: true,
    // P0-4 (2026-07-25): email verification re-enabled.
    // Resend magic-link path is already wired (see magicLink plugin below) and
    // shares the RESEND_API_KEY env. The /root/.env + /home/deploy/gustale.com/.env
    // pair must stay in sync (see SHARED_STATE 2026-07-23 "API auth divergence").
    // sendOnSignUp + sendVerificationEmail are only active if RESEND_API_KEY is set;
    // if missing, the verification email goes to console (matches the magicLink
    // dev fallback below) and requireEmailVerification is effectively a no-op
    // because no email is sent — so dev still works without a configured key.
    requireEmailVerification: !!env.RESEND_API_KEY,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: true,
    // Better-auth's default password hashing is scrypt; we'll override to argon2id in a
    // future patch for defense-in-depth. Scrypt is still considered secure in 2026.
  },

  emailVerification: {
    // P0-4 (2026-07-25): re-enabled.
    sendOnSignUp: !!env.RESEND_API_KEY,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      // Mirror the magicLink fallback: log to console in dev (no API key),
      // send via Resend in prod. Same env, same sender, same package.
      if (!env.RESEND_API_KEY) {
        console.log(`[EMAIL VERIFY] ${user.email} -> ${url}`);
        return;
      }
      const { Resend } = await import("resend");
      const resend = new Resend(env.RESEND_API_KEY);
      await resend.emails.send({
        from: "Gustale <no-reply@gustale.com>",
        to: user.email,
        subject: "Confirm your Gustale account",
        html: `<p>Welcome to Gustale — confirm your email to publish dishes and contribute.</p>
                 <p><a href="${url}">${url}</a></p>
                 <p>The link expires in 1 hour. If you didn't sign up, ignore this email.</p>`,
      });
    },
  },

  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
      // Only enable if both are present; allows dev to skip OAuth setup.
      enabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    },
  },

  // Magic links via Resend. Disabled if no API key is configured.
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        if (!env.RESEND_API_KEY) {
          // In dev, log the URL to the console so devs can click it.
          // In prod, this branch should never run — Resend must be configured.
          console.log(`[MAGIC LINK] ${email} -> ${url}`);
          return;
        }
        const { Resend } = await import("resend");
        const resend = new Resend(env.RESEND_API_KEY);
        await resend.emails.send({
          from: "Gustale <no-reply@gustale.com>",
          to: email,
          subject: "Your sign-in link for Gustale",
          html: `<p>Click the link below to sign in to Gustale. The link expires in 10 minutes.</p>
                 <p><a href="${url}">${url}</a></p>
                 <p>If you didn't request this, you can safely ignore this email.</p>`,
        });
      },
      expiresIn: 600, // 10 minutes
    }),
    passkey({
      rpName: "Gustale",
      rpID: env.BETTER_AUTH_URL
        ? new URL(env.BETTER_AUTH_URL).hostname
        : "gustale.com",
      origin: env.BETTER_AUTH_URL ? [env.BETTER_AUTH_URL] : undefined,
    }),
  ],

  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:4000",
    "https://gustale.com",
    "https://www.gustale.com",
    "https://gustale.recipes",
    "https://www.gustale.recipes",
  ],

  advanced: {
    cookiePrefix: "gustale",
    useSecureCookies: env.NODE_ENV === "production",
    defaultCookieAttributes: {
      sameSite: "lax",
      httpOnly: true,
    },
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60, // 1 minute
    max: 30, // 30 requests per minute per IP
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "contributor",
        input: false, // users can't set their own role via signup
      },
      displayName: {
        type: "string",
        required: false,
        input: true,
      },
      bio: {
        type: "string",
        required: false,
        input: true,
      },
      locale: {
        type: "string",
        required: false,
        defaultValue: "en",
        input: true,
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once per day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
});

export type Auth = typeof auth;
