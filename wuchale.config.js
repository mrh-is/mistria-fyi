import { adapter } from "@wuchale/svelte";
import { defineConfig } from "wuchale";
import { adapter as scriptAdapter } from "wuchale/adapter-vanilla";

import {
  aboutMetadataFile,
  aboutSvelteFiles,
  sharedSvelteFiles,
} from "./scripts/lib/wuchale-source-files.js";
import { partitionedStorage } from "./scripts/lib/wuchale-storage.js";
import { LOCALE_CODES } from "./src/lib/types/locale.ts";

const aboutStorage = partitionedStorage(["about"], () => "about");

export default defineConfig({
  adapters: {
    about: adapter({
      files: aboutSvelteFiles,
      loader: "custom",
      // The route owns a runtime snapshot, and the root layout remounts it on locale change.
      runtime: { initReactive: () => false },
      storage: aboutStorage,
    }),
    "about-metadata": scriptAdapter({
      files: aboutMetadataFile,
      loader: "custom",
      // This opt-in file has one function with a runtime parameter supplied by the page load.
      runtime: { plain: { wrapInit: () => "_runtime" } },
      storage: aboutStorage,
    }),
    shared: adapter({
      files: sharedSvelteFiles,
      loader: "custom",
      // A module script can run before the route loads its catalog. Only instances read it.
      runtime: {
        initReactive: (_scope, _file, /** @type {{ module: boolean }} */ context) =>
          context.module ? null : false,
      },
      storage: partitionedStorage(["shared"], () => "shared"),
    }),
  },
  dev: "read",
  locales: [...LOCALE_CODES],
  localesDir: "src/lib/i18n/catalogs",
});
