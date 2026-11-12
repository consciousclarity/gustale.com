import { db } from "@gustale/db";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

/**
 * The build identity of THIS API process.
 *
 * WHY THIS EXISTS
 * ---------------
 * The post-deploy check ("Real verify" in ci.yml) verifies that the
 * CONTAINERS on the VPS are running the expected image. That is the
 * right check, but it only proves what the container was STARTED with.
 * It cannot tell you what is actually SERVING traffic right now: the
 * container could have been recreated from a retagged image, or the
 * deploy could have swapped the container back, or a second process
 * could be bound to the port.
 *
 * So the API reports its own build identity, and the check compares
 * the SERVED identity with the expected SHA. If they disagree, the
 * deploy fails loudly -- which is the whole point.
 *
 * The values come from the build environment (see the Dockerfile's
 * build args and scripts/hermes/build-web-live.sh). They are
 * ADDITIVE to the /health payload: every existing field keeps its
 * shape, so nothing that reads /health can break.
 *
 * "served" is the important word here. The image tag says what the
 * container was created with. The served SHA says what answered the
 * request. When they are the same, the deploy is real.
 */
function buildInfo() {
  const sha = process.env.BUILD_SHA ?? process.env.GITHUB_SHA ?? null;
  const builtAt = process.env.BUILD_TIME ?? null;
  const ref = process.env.GIT_REF ?? process.env.GITHUB_REF ?? null;
  return {
    sha,
    shortSha: sha ? sha.slice(0, 7) : null,
    builtAt,
    ref,
    version: process.env.APP_VERSION ?? null,
  };
}

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/health", async (request, reply) => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      // ADDITIVE. Existing consumers keep working; the deploy check
      // uses it to assert the SERVED build matches the expected SHA.
      build: buildInfo(),
    };
  });

  app.get("/ready", async (request, reply) => {
    try {
      const result = await db.execute(sql`SELECT 1 AS ok`);
      const row = (result as any)[0];
      if (row?.ok !== 1) {
        return reply
          .status(503)
          .send({ status: "not_ready", reason: "db_check_failed" });
      }
      return {
        status: "ready",
        timestamp: new Date().toISOString(),
        checks: { database: "ok" },
        build: buildInfo(),
      };
    } catch (err) {
      request.log.error({ err }, "readiness check failed");
      return reply.status(503).send({
        status: "not_ready",
        reason: "db_unreachable",
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  });
}
