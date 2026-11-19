import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * THE SNAPSHOT CACHE MUST NOT OUTLIVE THE API'S SCHEMA.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * `apps/web/scripts/fetch-live-snapshot.mjs` caches each dish's detail
 * and decides whether to re-fetch it by comparing the dish's
 * `updatedAt` against the stamp it cached with.
 *
 * That is enough for a change to the DISH. It is NOT enough for a
 * change to the API's RESPONSE SHAPE: a new field can appear on every
 * dish without a single dish's `updatedAt` moving.
 *
 * WHAT WENT WRONG ON 2026-11-19
 * -----------------------------
 * The API gained `ingredients[].category` -- the field the dish page
 * needs to fill its "Prepared components" list (PR #271, commit
 * `4ae18c5`).
 *
 * The build directory on the VPS is PERSISTENT and the snapshot cache
 * is gitignored, so `git checkout --force` never cleared it. The
 * cached stamp -- the dish's `updatedAt`, 2026-10-26 -- never moved,
 * because the DISH did not change; only the API's response did.
 *
 * Result: every dish was served from the cache, with `category: null`,
 * and the live moussaka page printed no prepared components at all,
 * while the API -- queried directly -- returned the category
 * correctly. The deployed page had 23 ingredients and 0 categories.
 *
 * THE FIX
 * -------
 * The shape of the API's response is part of the cache's stamp. It is
 * computed from ONE dish (the response has the same shape for every
 * dish) and compared against the shape the cached detail was stored
 * with. When they differ, every dish is re-fetched.
 *
 * One full re-fetch when the API's shape changes is the right cost.
 * The alternative is a page that silently loses a field.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
// This test lives in apps/web/src/lib/, so the app root is two levels up.
const FETCHER = join(HERE, "..", "..", "scripts", "fetch-live-snapshot.mjs");

interface Ingredient {
  slug: string;
  name: string;
  category: string | null;
}

interface Detail {
  slug: string;
  name: string;
  updatedAt: string;
  ingredients: Ingredient[];
}

interface ServerState {
  detailRequests: number;
}

interface ServerHandle {
  port: number;
  state: ServerState;
  close: () => Promise<void>;
}

/**
 * A stand-in for the live API.
 *
 * `withCategory` is the switch that models the API's SHAPE: when it is
 * false, the ingredients carry no `category` field at all -- which is
 * exactly what the API returned before PR #271.
 */
async function startApi(
  opts: { withCategory: boolean; ingredientCount?: number } = {
    withCategory: true,
  },
): Promise<ServerHandle> {
  const ingredientCount = opts.ingredientCount ?? 4;
  const state: ServerState = { detailRequests: 0 };

  const dish = (slug: string): Detail => {
    const ingredients: Ingredient[] = [];
    for (let i = 0; i < ingredientCount; i++) {
      const base = { slug: `ing-${i}`, name: `ingredient ${i}` };
      ingredients.push(
        opts.withCategory
          ? { ...base, category: i === 0 ? "savoury-sauces" : null }
          : (base as Ingredient),
      );
    }
    return {
      slug,
      name: `the ${slug}`,
      updatedAt: "2026-10-26T00:00:00.000Z",
      ingredients,
    };
  };

  const server: Server = createServer((req, res) => {
    const url = (req.url ?? "").split("?")[0];
    const send = (body: unknown) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (url === "/api/dishes") {
      send({
        dishes: [
          {
            slug: "moussaka-greek",
            name: "moussaka",
            updatedAt: "2026-10-26T00:00:00.000Z",
            imageUrl: null,
            slugType: null,
          },
        ],
        total: 1,
      });
      return;
    }

    if (url === "/api/dishes/moussaka-greek") {
      state.detailRequests++;
      send(dish("moussaka-greek"));
      return;
    }

    if (url.startsWith("/api/dishes/")) {
      // Any other DISH detail. Three kinds of path start with
      // `/api/dishes/` but are NOT dish details -- `/journey` and
      // `/atlas` are sub-resources of a dish, and `/map` and
      // `/featured` are list endpoints. Counting them would make this
      // counter mean several things at once, so this counter means
      // exactly one thing: how many times a DISH DETAIL was fetched.
      const isDetail = !/\/(journey|atlas|map|featured)$/.test(url);
      if (isDetail) state.detailRequests++;
      send(dish(url.replace("/api/dishes/", "")));
      return;
    }

    send({});
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    port,
    state,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

/**
 * Run the fetcher as a CHILD PROCESS.
 *
 * It must be async, not `execFileSync`: the stand-in API runs in THIS
 * process, and a synchronous child would block the event loop that has
 * to answer the child's requests. The first version of this test used
 * `execFileSync` and every fetch hung until it timed out.
 */
function runFetch(
  port: number,
  out: string,
  cache: string,
  dishes = 5,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        FETCHER,
        "--api",
        `http://127.0.0.1:${port}`,
        "--out",
        out,
        "--cache",
        cache,
        "--dishes",
        String(dishes),
        "--concurrency",
        "3",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

interface Snapshot {
  details: Record<string, Detail>;
}

interface Cache {
  shape?: string;
  dishes: Record<string, { stamp: string; shape?: string; detail: Detail }>;
}

describe("the snapshot cache and the API's response shape", () => {
  let dir: string;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "snapshot-shape-"));
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("records the API's response shape in the cache", async () => {
    const api = await startApi({ withCategory: true });
    try {
      const out = join(dir, "s1.json");
      const cacheFile = join(dir, "c1.json");
      const result = await runFetch(api.port, out, cacheFile);
      assert.equal(result.code, 0, result.stderr);

      const cache: Cache = JSON.parse(readFileSync(cacheFile, "utf-8"));
      const shape = cache.shape;
      assert.ok(
        typeof shape === "string" && shape.length > 0,
        "the cache must record the API's response shape",
      );
      assert.ok(
        shape.includes("category"),
        `the shape must include the category field, got: ${shape}`,
      );

      const snapshot: Snapshot = JSON.parse(readFileSync(out, "utf-8"));
      const moussaka = snapshot.details["moussaka-greek"];
      assert.ok(moussaka, "the snapshot must hold the dish");
      assert.equal(
        moussaka.ingredients[0].category,
        "savoury-sauces",
        "the fetched detail must carry the category",
      );
    } finally {
      await api.close();
    }
  });

  it("REUSES the cache when the API's shape has not changed", async () => {
    const api = await startApi({ withCategory: true });
    try {
      const out = join(dir, "s2.json");
      const cacheFile = join(dir, "c2.json");

      const first = await runFetch(api.port, out, cacheFile);
      assert.equal(first.code, 0, first.stderr);
      const afterFirst = api.state.detailRequests;

      // A SECOND run against an API of the SAME shape must not re-fetch
      // the dish. The shape probe costs exactly one request.
      const second = await runFetch(api.port, out, cacheFile);
      assert.equal(second.code, 0, second.stderr);
      assert.equal(
        api.state.detailRequests - afterFirst,
        1,
        "only the shape probe may hit the API when the shape is unchanged",
      );
    } finally {
      await api.close();
    }
  });

  it("INVALIDATES the cache when the API's shape changes", async () => {
    const api = await startApi({ withCategory: true });
    try {
      const out = join(dir, "s3.json");
      const cacheFile = join(dir, "c3.json");

      const first = await runFetch(api.port, out, cacheFile);
      assert.equal(first.code, 0, first.stderr);
      const afterFirst = api.state.detailRequests;

      // Now the API changes shape: it stops sending `category`. The
      // dish's `updatedAt` has NOT moved -- this is the exact condition
      // that let the stale cache survive on the VPS.
      api.state.detailRequests = 0;
      const changed = await startApi({ withCategory: false });
      try {
        const second = await runFetch(changed.port, out, cacheFile);
        assert.equal(second.code, 0, second.stderr);
        assert.equal(
          changed.state.detailRequests,
          1,
          "the dish must be re-fetched: the probe IS the dish's fetch",
        );

        const snapshot: Snapshot = JSON.parse(readFileSync(out, "utf-8"));
        const moussaka = snapshot.details["moussaka-greek"];
        assert.equal(
          moussaka.ingredients[0].category,
          undefined,
          "the re-fetched detail must carry the NEW shape",
        );
      } finally {
        await changed.close();
      }
      assert.equal(afterFirst, 1, "the first run fetched the dish once");
    } finally {
      await api.close();
    }
  });

  it("INVALIDATES a cache written before the shape was known", async () => {
    const api = await startApi({ withCategory: true });
    try {
      const out = join(dir, "s4.json");
      const cacheFile = join(dir, "c4.json");

      // A cache written by the OLD code: no `shape` anywhere.
      const cache: Cache = {
        dishes: {
          "moussaka-greek": {
            stamp: "2026-10-26T00:00:00.000Z",
            detail: {
              slug: "moussaka-greek",
              name: "moussaka",
              updatedAt: "2026-10-26T00:00:00.000Z",
              ingredients: [
                { slug: "ing-0", name: "ingredient 0", category: null },
              ],
            },
          },
        },
      };
      writeFileSync(cacheFile, JSON.stringify(cache));

      const result = await runFetch(api.port, out, cacheFile);
      assert.equal(result.code, 0, result.stderr);

      const snapshot: Snapshot = JSON.parse(readFileSync(out, "utf-8"));
      assert.equal(
        snapshot.details["moussaka-greek"].ingredients[0].category,
        "savoury-sauces",
        "a cache with no recorded shape must be re-fetched, not trusted",
      );
    } finally {
      await api.close();
    }
  });

  it("describes the RESPONSE, not the dish: the ingredient COUNT does not change the shape", async () => {
    const few = await startApi({ withCategory: true, ingredientCount: 4 });
    const many = await startApi({ withCategory: true, ingredientCount: 23 });
    try {
      const outA = join(dir, "s5a.json");
      const outB = join(dir, "s5b.json");
      const cacheA = join(dir, "c5a.json");
      const cacheB = join(dir, "c5b.json");

      const a = await runFetch(few.port, outA, cacheA);
      const b = await runFetch(many.port, outB, cacheB);
      assert.equal(a.code, 0, a.stderr);
      assert.equal(b.code, 0, b.stderr);

      const shapeA: Cache = JSON.parse(readFileSync(cacheA, "utf-8"));
      const shapeB: Cache = JSON.parse(readFileSync(cacheB, "utf-8"));
      assert.equal(
        shapeA.shape,
        shapeB.shape,
        "a dish with 4 ingredients and one with 23 have the SAME shape",
      );
    } finally {
      await few.close();
      await many.close();
    }
  });
});
