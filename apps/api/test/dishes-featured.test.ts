/**
 * Integration test for GET /api/dishes/featured (the Startpage's 12).
 *
 * WHY THIS FILE EXISTS
 *
 * The Startpage features twelve dishes, chosen by a RULE rather than
 * by hand. A rule that is implemented but never tested is a rule that
 * quietly stops being true — the twelve change, nobody notices, and
 * the page drifts away from what it claims to show.
 *
 * WHAT IS COVERED
 *
 *   - the route is REACHABLE. `/api/dishes/:slug` is registered
 *     BEFORE `/api/dishes/featured` in the same file. Fastify's
 *     router prefers a static segment over a parameter, but "the
 *     router prefers it" is a claim about a library, and this is
 *     exactly the kind of claim that stops being true on an upgrade.
 *     The route is therefore tested for being reachable, and for not
 *     being shadowed into a 404 by `:slug`.
 *   - every returned dish MEETS THE RULE: a photo, a definition, an
 *     origin and a family. A dish that meets only three of the four
 *     is not featured.
 *   - a dish with NO photo is not featured. This is the one that
 *     bites, because 165 of the 1,474 published dishes have no
 *     cover, and the query joins on the cover rather than filtering
 *     for it after the fact.
 *   - a dish with NO family is not featured (29 of them).
 *   - a DRINK is not featured. The Startpage has no drinks row
 *     until the drink catalogue is large enough to promise; there
 *     are 8 verified drinks, and the threshold is about 40.
 *   - the ORDER is deterministic, so the same twelve come back for
 *     the same data.
 *   - `limit` is honoured and capped.
 *
 * Boot notes: the app is built in-process and uses DATABASE_URL from
 * process.env — the same setup as the other integration tests.
 */

import type { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
});

describe("GET /api/dishes/featured — the Startpage's twelve", () => {
  it("is reachable, and is NOT shadowed by /api/dishes/:slug", async () => {
    // The shadowing check. If `:slug` swallowed the request, this
    // would be a 404 for a dish whose slug is "featured" — which is
    // indistinguishable from "the route does not exist" to anyone
    // reading the logs.
    const res = await app.inject({ method: "GET", url: "/api/dishes/featured" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("dishes");
    expect(Array.isArray(body.dishes)).toBe(true);
  });

  it("returns at most the default twelve", async () => {
    const body = (await app.inject({ method: "GET", url: "/api/dishes/featured" })).json();
    expect(body.dishes.length).toBeLessThanOrEqual(12);
  });

  it("honours and caps limit", async () => {
    const three = (
      await app.inject({ method: "GET", url: "/api/dishes/featured?limit=3" })
    ).json();
    expect(three.dishes.length).toBeLessThanOrEqual(3);

    // The cap. A limit of 500 would return the whole catalogue and
    // defeat the point of a curated row.
    const capped = await app.inject({
      method: "GET",
      url: "/api/dishes/featured?limit=500",
    });
    expect(capped.statusCode).toBe(400);
  });

  it("features only dishes that meet ALL FOUR parts of the rule", async () => {
    const body = (await app.inject({ method: "GET", url: "/api/dishes/featured" })).json();

    for (const dish of body.dishes) {
      // PHOTO
      expect(dish.cover).toBeTruthy();
      expect(dish.cover.publicUrl).toBeTruthy();
      // DEFINITION
      expect(dish.shortDescription).toBeTruthy();
      expect(dish.shortDescription.trim().length).toBeGreaterThan(0);
      // ORIGIN
      expect(dish.originName).toBeTruthy();
      // FAMILY
      expect(dish.familySlug).toBeTruthy();
      expect(dish.familyName).toBeTruthy();
    }
  });

  it("features no drinks", async () => {
    // The Startpage carries no drinks row yet: there are 8 verified
    // drinks and the threshold is about 40. `content_type` is the
    // editorial field that says so.
    const body = (await app.inject({ method: "GET", url: "/api/dishes/featured" })).json();

    for (const dish of body.dishes) {
      expect(dish.contentType).not.toBe("drink");
    }
  });

  it("is deterministic: the same request returns the same order", async () => {
    const first = (await app.inject({ method: "GET", url: "/api/dishes/featured" })).json();
    const second = (await app.inject({ method: "GET", url: "/api/dishes/featured" })).json();

    expect(first.dishes.map((d: any) => d.slug)).toEqual(
      second.dishes.map((d: any) => d.slug),
    );
  });

  it("orders by attention, most-viewed first", async () => {
    const body = (await app.inject({ method: "GET", url: "/api/dishes/featured" })).json();

    const counts = body.dishes.map((d: any) => d.viewCount);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]);
    }
  });
});
