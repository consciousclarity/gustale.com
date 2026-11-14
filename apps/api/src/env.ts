import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().default("http://localhost:4321"),
  SESSION_SECRET: z.string().min(32),
  MINIO_ENDPOINT: z.string().url().default("http://127.0.0.1:9000"),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_BUCKET_PUBLIC: z.string().default("gustale-public"),
  MINIO_BUCKET_PRIVATE: z.string().default("gustale-media"),

  // Better-auth
  // Production: https://gustale.com. Dev: http://localhost:4000. Must NOT have a trailing slash.
  BETTER_AUTH_URL: z.string().url().default("http://localhost:4000"),
  // The WebAuthn RP ID.
  //
  // It was DERIVED from BETTER_AUTH_URL's hostname, which made it
  // `api.gustale.com` in production. That is a sibling of
  // `recipes.gustale.com`, not a suffix of it, so a passkey registered
  // under it could not be used on the recipes host -- and the value
  // changed silently if BETTER_AUTH_URL ever changed.
  //
  // `gustale.com` is the registrable domain of BOTH
  // `api.gustale.com` and `recipes.gustale.com`, so one RP ID covers
  // the whole tree.
  //
  // It is explicit now, not derived. `api.gustale.recipes` has eTLD+1
  // `gustale.recipes`, a DIFFERENT registrable domain -- a passkey
  // scoped to `gustale.com` will not work there.
  //
  // The value was changed on 2026-11-14 with ZERO passkeys registered
  // (the table had 0 rows), so no credential was stranded. Changing it
  // later is a ONE-WAY operation: the RP ID is hashed into the
  // credential, so every existing passkey would have to be re-enrolled.
  PASSKEY_RP_ID: z.string().default("gustale.com"),
  // 32+ random chars; used to sign session cookies and CSRF tokens.
  BETTER_AUTH_SECRET: z.string().min(32),
  // Google OAuth (optional — provider is only enabled when both are set)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Resend for magic links (optional — magic links are disabled when missing)
  RESEND_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    "Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env: Env = parsed.data;
