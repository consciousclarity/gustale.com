// @ts-check

import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
    server: {
      // Client islands fetch same-origin `/api/*`. In prod, Caddy proxies
      // that to the API. In local `astro dev` there is no Caddy — forward
      // to the Fastify process on :4000 so the homepage/list islands work.
      proxy: {
        "/api": {
          // The API's dev port is overridable.
          //
          // It was hardcoded to 4000, which means the dev web cannot
          // talk to a dev API on any other port — and on this host
          // 4000 is already held by another user's long-running
          // process, so the proxy always reached a STALE API. The
          // symptom was a 404 on a route that existed in the source.
          //
          // DEV_API_URL is read from the environment and falls back to
          // the old default, so nothing that relies on 4000 changes.
          target: process.env.DEV_API_URL ?? "http://127.0.0.1:4000",
          changeOrigin: true,
        },
      },
    },
  },
});
