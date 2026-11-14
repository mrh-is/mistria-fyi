import { adapter, defaultArgs } from "@wuchale/svelte";
import { defineConfig, gemini } from "wuchale";
import { adapter as scriptAdapter } from "wuchale/adapter-vanilla";

import {
  aboutMetadataFile,
  aboutSvelteFiles,
  acquisitionFiles,
  dataErrorMessagesFile,
  errorMetadataFile,
  errorSvelteFile,
  routeMetadataFiles,
  routeSvelteFiles,
  sharedLocaleFiles,
  sharedScriptFiles,
  sharedSvelteFiles,
} from "#scripts/lib/wuchale-source-files";
import { partitionedStorage } from "#scripts/lib/wuchale-storage";

import { ROUTE_UI_GROUPS, SYNC_CODE_SOURCE } from "./src/lib/i18n/route-ui-groups.ts";
import { LOCALE_CODES } from "./src/lib/types/locale.ts";

const aboutStorage = partitionedStorage(["about"], () => "about");
const errorStorage = partitionedStorage(["errors"], () => "errors");
const sharedStorage = partitionedStorage(["shared"], () => "shared");
const instanceRuntime = {
  // A module script can run before the route loads its catalog. Only instances read it.
  initReactive: (_scope: unknown, _file: string, context: { module: boolean }) =>
    context.module ? null : false,
};
const routeStorage = partitionedStorage(
  [...ROUTE_UI_GROUPS.map(({ shard }) => `route-${shard}`), "route-shared"],
  ({ references }) => {
    if (references.length > 0 && references.every(({ file }) => file === SYNC_CODE_SOURCE)) {
      return "route-sync-code";
    }
    const routes = new Set(references.map(({ file }) => file.split("/")[2]));
    const group = ROUTE_UI_GROUPS.find(({ paths }) => routes.has(paths[0] || "+page.svelte"));
    return group && routes.size === 1 ? `route-${group.shard}` : "route-shared";
  },
);

export default defineConfig({
  adapters: {
    about: adapter({
      files: aboutSvelteFiles,
      loader: "custom",
      // The About page owns a runtime snapshot for the lifetime of its route content.
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
    acquisition: scriptAdapter({
      files: acquisitionFiles,
      loader: "custom",
      storage: partitionedStorage(["acquisition"], () => "acquisition"),
    }),
    "data-errors": scriptAdapter({
      files: dataErrorMessagesFile,
      loader: "custom",
      storage: partitionedStorage(["data-errors"], () => "data-errors"),
    }),
    errors: adapter({
      files: errorSvelteFile,
      loader: "custom",
      // Error copy must render even when the route's catalog failed to load.
      loading: { direct: true },
      runtime: instanceRuntime,
      storage: errorStorage,
    }),
    "errors-metadata": scriptAdapter({
      files: errorMetadataFile,
      loader: "custom",
      loading: { direct: true },
      storage: errorStorage,
    }),
    metadata: scriptAdapter({
      // Route-group directory names contain literal parentheses in SvelteKit.
      files: routeMetadataFiles.map((file) => file.replaceAll("(", "[(]").replaceAll(")", "[)]")),
      loader: "custom",
      storage: partitionedStorage(["metadata"], () => "metadata"),
    }),
    offline: scriptAdapter({
      files: "scripts/lib/offline-copy.ts",
      loader: "custom",
      storage: partitionedStorage(["offline"], () => "offline"),
    }),
    route: adapter({
      files: { ignore: ["**/*.test-harness.svelte"], include: routeSvelteFiles },
      loader: "custom",
      loading: { granular: true, group: ROUTE_UI_GROUPS.map(({ pattern }) => pattern) },
      runtime: instanceRuntime,
      storage: routeStorage,
    }),
    shared: adapter({
      files: sharedSvelteFiles,
      loader: "custom",
      runtime: {
        initReactive: (scope, file, context) =>
          context.module ? null : defaultArgs.runtime.initReactive(scope, file, context),
      },
      storage: sharedStorage,
    }),
    "shared-locale": scriptAdapter({
      files: sharedLocaleFiles,
      loader: "custom",
      storage: sharedStorage,
    }),
    "shared-script": scriptAdapter({
      files: { ignore: [dataErrorMessagesFile], include: sharedScriptFiles },
      loader: "custom",
      storage: sharedStorage,
    }),
  },
  ai: process.env.WUCHALE_TRANSLATE === "1" ? gemini() : null,
  // The Vite plugin can use its dev transform even during a normal Vite production build.
  dev: process.env.NODE_ENV === "development" ? "add" : "read",
  locales: [...LOCALE_CODES],
  localesDir: "src/lib/i18n/catalogs",
});
