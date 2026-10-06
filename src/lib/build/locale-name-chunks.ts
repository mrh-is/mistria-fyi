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
  if (Object.keys(chunks).length === 0) {
    // An empty map would make the service worker precache every locale's chunks (~2.4 MB) with no
    // error, so a changed manifest layout or source path must stop the build instead.
    throw new Error(
      "The client manifest lists no locale name chunks; the service worker would precache every locale.",
    );
  }
  return Object.fromEntries(
    Object.entries(chunks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([locale, files]) => [locale, [...files].sort()]),
  );
}

/**
 * Throws unless the rendered service worker had the map inlined. A service worker that never
 * references the placeholder precaches every locale, so a missing replacement fails the build.
 */
export function assertLocaleNameChunksInlined(inlined: boolean): void {
  if (!inlined) {
    throw new Error(
      `No service worker chunk referenced ${LOCALE_NAME_CHUNKS_DEFINE}, so no locale name chunks were inlined.`,
    );
  }
}

/**
 * Hands the service worker the locale name-chunk map, so it can leave those chunks out of its
 * install-time precache and cache each locale on demand instead.
 *
 * SvelteKit 3 builds the service worker as its own Vite environment, after the client build writes
 * its manifest, and runs this plugin there. The map replaces the bare identifier in the rendered
 * service worker chunk; no other environment references it.
 */
export function localeNameChunksPlugin(): Plugin {
  let root = process.cwd();
  let inlined = false;
  return {
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    generateBundle() {
      if (this.environment.name === "serviceWorker") {
        assertLocaleNameChunksInlined(inlined);
      }
    },
    name: "mfg:locale-name-chunks",
    renderChunk(code) {
      if (this.environment.name !== "serviceWorker" || !code.includes(LOCALE_NAME_CHUNKS_DEFINE)) {
        return null;
      }
      const manifestPath = path.resolve(root, ".svelte-kit/output/client/.vite/manifest.json");
      if (!existsSync(manifestPath)) {
        throw new Error(`localeNameChunksPlugin needs the client manifest at ${manifestPath}.`);
      }
      const chunks = localeNameChunks(JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest);
      inlined = true;
      return {
        code: code.replaceAll(
          new RegExp(`\\b${LOCALE_NAME_CHUNKS_DEFINE}\\b`, "g"),
          `(${JSON.stringify(chunks)})`,
        ),
        map: null,
      };
    },
  };
}
