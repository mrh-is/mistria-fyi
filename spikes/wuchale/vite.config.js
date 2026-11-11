import adapter from "@sveltejs/adapter-cloudflare";
import { sveltekit } from "@sveltejs/kit/vite";
import path from "node:path";
import { defineConfig } from "vite";
import { wuchale } from "wuchale/vite";

const fromFixture = (...parts) => path.resolve(import.meta.dirname, ...parts);

export default defineConfig({
  plugins: [
    wuchale({ configPath: fromFixture("wuchale.config.js") }),
    sveltekit({
      adapter: adapter({ config: fromFixture("wrangler.toml") }),
      serviceWorker: { register: false },
    }),
  ],
  resolve: {
    alias: {
      "#fixture-search": fromFixture("src/features/search/panel.svelte"),
      "#fixture-settings": fromFixture("src/features/settings/panel.svelte"),
      "#fixture-ui": fromFixture("src/features/load-ui.js"),
    },
  },
});
