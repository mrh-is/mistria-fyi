import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Manifest, Plugin } from "vite";

/** The global the service worker reads its per-locale name-chunk paths from. */
export const LOCALE_NAME_CHUNKS_DEFINE = "__LOCALE_NAME_CHUNKS__";

/** Source modules `names.ts` code-splits into one chunk per locale & category. */
const LOCALE_NAME_SOURCE = /^src\/lib\/data\/locales\/([^/]+)\/.+\.json$/;

/**
 * Groups the client build's emitted name chunks by locale, as root-relative paths matching the
 * service worker's `build` list. The grouping comes from each chunk's source module in the Vite
 * manifest, never from its hashed filename, which encodes nothing about the locale.
 */
export function localeNameChunks(manifest: Manifest): Record<string, string[]> {
  const chunks: Record<string, Set<string>> = {};
  for (const [source, chunk] of Object.entries(manifest)) {
    const locale = LOCALE_NAME_SOURCE.exec(source)?.[1];
    if (locale === undefined) continue;
    (chunks[locale] ??= new Set()).add(`/${chunk.file}`);
  }
  return Object.fromEntries(
    Object.entries(chunks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([locale, files]) => [locale, [...files].sort()]),
  );
}

/**
 * Hands the service worker the locale name-chunk map, so it can leave those chunks out of its
 * install-time precache and cache each locale on demand instead.
 *
 * SvelteKit builds the service worker last, after the client build writes its manifest, and
 * passes the outer build's `define` object to that build. The service worker build accepts no
 * plugins of its own, so the entry is a getter on that object: it reads the manifest when the
 * service worker build resolves its config, not when this plugin runs. The server build also
 * reads the getter, before the client manifest exists; nothing on the server uses the value.
 */
export function localeNameChunksPlugin(): Plugin {
  return {
    apply: "build",
    configResolved(config) {
      if (!config.build.ssr) return;
      if (!config.define) {
        throw new Error("localeNameChunksPlugin expects SvelteKit to define build constants.");
      }
      const manifestPath = path.resolve(config.root, ".svelte-kit/output/client/.vite/manifest.json");
      Object.defineProperty(config.define, LOCALE_NAME_CHUNKS_DEFINE, {
        configurable: true,
        enumerable: true,
        get: () =>
          JSON.stringify(
            existsSync(manifestPath)
              ? localeNameChunks(JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest)
              : {},
          ),
      });
    },
    name: "mfg:locale-name-chunks",
  };
}
