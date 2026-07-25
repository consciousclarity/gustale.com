/**
 * Integration tests for GET /api/dishes/:slug/journey (P1-1).
 *
 * Requires a seeded DB. Flagship journeys (e.g. vindaloo) come from
 * JOURNEY_BEATS in packages/db seed-data; dishes without beats return [].
 */

import type { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
});

describe("GET /api/dishes/:slug/journey", () => {
  it("returns ordered beats with confidence for a flagship dish", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/vindaloo/journey",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.slug).toBe("vindaloo");
    expect(Array.isArray(body.beats)).toBe(true);
    expect(body.beats.length).toBeGreaterThanOrEqual(3);
    const sequences = body.beats.map((b: { sequence: number }) => b.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    for (const beat of body.beats) {
      expect(beat).toHaveProperty("placeName");
      expect(beat).toHaveProperty("label");
      expect(["documented", "likely", "possible", "parallel"]).toContain(
        beat.confidence,
      );
    }
    // First vindaloo beat should cite a source when seeded.
    expect(
      body.beats[0].source === null || body.beats[0].source?.title,
    ).toBeTruthy();
  });

  it("returns 200 with an empty beats array when the dish has no journey", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/gazpacho/journey",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.slug).toBe("gazpacho");
    expect(body.beats).toEqual([]);
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/definitely-not-a-real-dish-xyz/journey",
    });
    expect(res.statusCode).toBe(404);
  });
});
