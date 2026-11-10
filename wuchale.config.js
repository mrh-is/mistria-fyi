import { adapter } from "@wuchale/svelte";
import { defineConfig } from "wuchale";
import { adapter as scriptAdapter } from "wuchale/adapter-vanilla";

import { partitionedStorage } from "./scripts/lib/wuchale-storage.js";
import { LOCALE_CODES } from "./src/lib/types/locale.ts";

const aboutStorage = partitionedStorage(["about"], () => "about");

export default defineConfig({
  adapters: {
    about: adapter({
      files: [
        "src/routes/about/about-copy.svelte",
        "src/lib/components/ai-disclosure-dialog.svelte",
      ],
      loader: "custom",
      // The route owns a runtime snapshot, and the root layout remounts it on locale change.
      runtime: { initReactive: () => false },
      storage: aboutStorage,
    }),
    "about-metadata": scriptAdapter({
      files: "src/routes/about/about-metadata.ts",
      loader: "custom",
      // This opt-in file has one function with a runtime parameter supplied by the page load.
      runtime: { plain: { wrapInit: () => "_runtime" } },
      storage: aboutStorage,
    }),
  },
  dev: "read",
  locales: [...LOCALE_CODES],
  localesDir: "src/lib/i18n/catalogs",
});
