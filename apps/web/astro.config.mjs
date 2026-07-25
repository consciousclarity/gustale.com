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
          target: "http://127.0.0.1:4000",
          changeOrigin: true,
        },
      },
    },
  },
});
