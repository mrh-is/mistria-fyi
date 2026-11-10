import { adapter } from "@wuchale/svelte";
import { defineConfig } from "wuchale";
import { adapter as scriptAdapter } from "wuchale/adapter-vanilla";

import {
  aboutMetadataFile,
  aboutSvelteFiles,
  routeMetadataFiles,
  routeSvelteFiles,
  sharedSvelteFiles,
} from "./scripts/lib/wuchale-source-files.js";
import { partitionedStorage } from "./scripts/lib/wuchale-storage.js";
import { ROUTE_UI_GROUPS } from "./src/lib/i18n/route-ui-groups.ts";
import { LOCALE_CODES } from "./src/lib/types/locale.ts";

const aboutStorage = partitionedStorage(["about"], () => "about");
const instanceRuntime = {
  // A module script can run before the route loads its catalog. Only instances read it.
  initReactive: (
    /** @type {unknown} */ _scope,
    /** @type {string} */ _file,
    /** @type {{ module: boolean }} */ context,
  ) => (context.module ? null : false),
};
const routeStorage = partitionedStorage(
  [...ROUTE_UI_GROUPS.map(({ shard }) => `route-${shard}`), "route-shared"],
  ({ references }) => {
    const routes = new Set(references.map(({ file }) => file.split("/")[2]));
    const group = ROUTE_UI_GROUPS.find(({ path }) => routes.has(path || "+page.svelte"));
    return group && routes.size === 1 ? `route-${group.shard}` : "route-shared";
  },
);

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
    metadata: scriptAdapter({
      // Route-group directory names contain literal parentheses in SvelteKit.
      files: routeMetadataFiles.map((file) => file.replaceAll("(", "[(]").replaceAll(")", "[)]")),
      loader: "custom",
      // Preloading uses the callback's target locale, even while the active page is different.
      runtime: { plain: { wrapInit: (expr) => expr.replace(/\)$/u, "_locale)") } },
      storage: partitionedStorage(["metadata"], () => "metadata"),
    }),
    offline: scriptAdapter({
      files: "scripts/lib/offline-copy.ts",
      loader: "custom",
      storage: partitionedStorage(["offline"], () => "offline"),
    }),
    route: adapter({
      files: routeSvelteFiles,
      loader: "custom",
      loading: { granular: true, group: ROUTE_UI_GROUPS.map(({ pattern }) => pattern) },
      runtime: instanceRuntime,
      storage: routeStorage,
    }),
    shared: adapter({
      files: sharedSvelteFiles,
      loader: "custom",
      runtime: instanceRuntime,
      storage: partitionedStorage(["shared"], () => "shared"),
    }),
  },
  dev: "read",
  locales: [...LOCALE_CODES],
  localesDir: "src/lib/i18n/catalogs",
});
