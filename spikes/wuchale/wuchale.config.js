import { adapter } from "@wuchale/svelte";
import { defineConfig } from "wuchale";

import settings from "../../project.inlang/settings.json" with { type: "json" };
import { splitStorage } from "./split-storage.js";

export default defineConfig({
  adapters: {
    ui: adapter({
      files: "src/features/**/*.svelte",
      loader: "sveltekit",
      loading: { granular: true },
      storage: splitStorage,
    }),
  },
  dev: "read",
  locales: settings.locales,
  localesDir: "catalogs",
});
