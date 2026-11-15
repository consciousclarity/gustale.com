#!/usr/bin/env node
// Exercise the actual Astro directory pages against a deliberately short API.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("../", import.meta.url));

for (const route of ["regions", "families"]) {
  test(`${route}: short list fails Astro build before writing page`, async () => {
    const fixture = createServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          dishes: [
            { slug: "fixture", canonicalName: "Fixture", originName: "Test" },
          ],
          total: 2,
          limit: 100,
          offset: 0,
          hasMore: false,
        }),
      );
    });
    await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
    const ws = await mkdtemp(join(web, ".directory-gate-"));
    try {
      await mkdir(join(ws, "src", "pages"), { recursive: true });
      for (const dir of [
        "components",
        "lib",
        "layouts",
        "types",
        "styles",
        "assets",
      ]) {
        await symlink(join(web, "src", dir), join(ws, "src", dir));
      }
      await symlink(join(web, "node_modules"), join(ws, "node_modules"));
      await cp(join(web, "astro.config.mjs"), join(ws, "astro.config.mjs"));
      await cp(
        join(web, "src", "pages", `${route}.astro`),
        join(ws, "src", "pages", `${route}.astro`),
      );
      const child = spawn(
        process.execPath,
        [join(web, "node_modules/astro/bin/astro.mjs"), "build"],
        {
          cwd: ws,
          env: {
            ...process.env,
            PUBLIC_DOMAIN: "geo",
            BUILD_DATA_SOURCE: "live",
            PUBLIC_API_BASE: `http://127.0.0.1:${fixture.address().port}`,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk) => {
        output += chunk;
      });
      const code = await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("close", resolve);
      });
      assert.notEqual(code, 0, output);
      assert.match(
        output,
        /the dish list is SHORT or inconsistent: collected 1 \(1 distinct\), the API says 2/,
      );
      const { existsSync } = await import("node:fs");
      assert.equal(existsSync(join(ws, "dist", route, "index.html")), false);
      console.log(
        `${route}: Astro exit ${code}; collected 1 (1 distinct), API says 2; page absent`,
      );
    } finally {
      fixture.closeAllConnections();
      await new Promise((resolve) => fixture.close(resolve));
      await rm(ws, { recursive: true, force: true });
    }
  });
}
