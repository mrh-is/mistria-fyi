import { adapter } from "@wuchale/svelte";
import { defineConfig } from "wuchale";

import settings from "./project.inlang/settings.json" with { type: "json" };
import { partitionedStorage } from "./scripts/lib/wuchale-storage.js";

export default defineConfig({
  adapters: {
    about: adapter({
      files: "src/routes/about/about-data-copy.svelte",
      loader: "custom",
      // The route owns a runtime snapshot, and the root layout remounts it on locale change.
      runtime: { initReactive: () => false },
      storage: partitionedStorage(["about"], () => "about"),
    }),
  },
  dev: "read",
  locales: settings.locales,
  localesDir: "src/lib/i18n/catalogs",
});
