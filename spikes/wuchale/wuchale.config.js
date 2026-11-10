import { adapter } from "@wuchale/svelte";
import { defineConfig } from "wuchale";

import { LOCALE_CODES } from "../../src/lib/types/locale.ts";
import { splitStorage } from "./split-storage.js";

export default defineConfig({
  adapters: {
    ui: adapter({
      files: "src/features/**/*.svelte",
      loader: "custom",
      loading: { granular: true },
      storage: splitStorage,
    }),
  },
  dev: "read",
  locales: [...LOCALE_CODES],
  localesDir: "catalogs",
});
