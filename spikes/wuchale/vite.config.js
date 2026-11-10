import adapter from "@sveltejs/adapter-cloudflare";
import { sveltekit } from "@sveltejs/kit/vite";
import path from "node:path";
import { defineConfig } from "vite";
import { wuchale } from "wuchale/vite";

const fromFixture = (...parts) => path.resolve(import.meta.dirname, ...parts);

export default defineConfig(({ mode }) => {
  const baseline = mode === "keyed";
  const featureDir = baseline ? "baseline" : "features";
  return {
    plugins: [
      ...(baseline ? [] : [wuchale({ configPath: fromFixture("wuchale.config.js") })]),
      sveltekit({
        adapter: adapter({ config: fromFixture("wrangler.toml") }),
        files: {
          hooks: { server: baseline ? "src/baseline/hooks.server" : "src/hooks.server" },
        },
        serviceWorker: { register: false },
      }),
    ],
    resolve: {
      alias: {
        "#fixture-search": fromFixture("src", featureDir, "search/panel.svelte"),
        "#fixture-settings": fromFixture("src", featureDir, "settings/panel.svelte"),
        "#fixture-ui": fromFixture("src", featureDir, "load-ui.js"),
      },
    },
  };
});
