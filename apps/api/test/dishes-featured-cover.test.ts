/** Cover serialization through the real routes, with read-only media fixtures. */
import Fastify, { type FastifyInstance } from "fastify";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.hoisted(() => {
  // Imports construct clients, but all query execution is mocked below.
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/wp01a_unused");
});
vi.mock("../src/env.js", () => ({
  env: {
    MINIO_ENDPOINT: "http://localhost:9000",
    MINIO_ACCESS_KEY: "unused-test-value",
    MINIO_SECRET_KEY: "unused-test-value",
  },
}));

vi.mock("@gustale/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@gustale/db")>();
  return { ...original, db: { execute: vi.fn() } };
});

import { db } from "@gustale/db";
import { registerDishRoutes } from "../src/routes/dishes.js";

let app: FastifyInstance;
const execute = vi.mocked(db.execute);
const row = {
  id: "00000000-0000-0000-0000-000000000020",
  slug: "moussaka-greek",
  canonical_name: "Moussaka",
  updated_at: "2026-11-11T00:00:00.000Z",
  cover_storage_key: "dishes/moussaka-greek/cover-1536w.webp",
  cover_variants: {
    "800": "dishes/moussaka-greek/cover-800w.webp",
    "1536": "dishes/moussaka-greek/cover-1536w.webp",
  },
};

beforeAll(async () => {
  app = Fastify();
  registerDishRoutes(app);
  await app.ready();
});
afterAll(async () => app.close());
beforeEach(() => execute.mockReset());

describe("featured cover URLs", () => {
  it("prefixes every featured variant URL with /media/", async () => {
    execute.mockResolvedValueOnce([row] as any);
    const res = await app.inject({
      method: "GET",
      url: "/api/dishes/featured",
    });
    expect(res.statusCode).toBe(200);
    const cover = res.json().dishes[0].cover;
    expect(Object.keys(cover.variantsUrls)).toEqual(["800", "1536"]);
    for (const url of Object.values(cover.variantsUrls)) {
      expect(url).toMatch(/^\/media\//);
    }
    expect(cover.publicUrl).toBe(`/media/${row.cover_storage_key}`);
  });

  it("returns the same variant URLs from featured and list for the same media row", async () => {
    execute.mockResolvedValueOnce([row] as any);
    const featured = await app.inject({
      method: "GET",
      url: "/api/dishes/featured",
    });
    execute.mockResolvedValueOnce([row] as any);
    execute.mockResolvedValueOnce([{ total: 1 }] as any);
    const list = await app.inject({ method: "GET", url: "/api/dishes" });
    expect(featured.statusCode).toBe(200);
    expect(list.statusCode).toBe(200);
    expect(featured.json().dishes[0].cover.variantsUrls).toEqual(
      list.json().dishes[0].cover.variantsUrls,
    );
  });

  it.each([null, undefined, {}])(
    "returns {} when a media row has no variants (%j)",
    async (variants) => {
      execute.mockResolvedValueOnce([
        { ...row, cover_variants: variants },
      ] as any);
      const res = await app.inject({
        method: "GET",
        url: "/api/dishes/featured",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().dishes[0].cover.variantsUrls).toEqual({});
    },
  );
});
