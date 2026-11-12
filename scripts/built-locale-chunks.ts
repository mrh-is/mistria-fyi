import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LOCALE_CODES } from "../src/lib/types/locale.js";

const CLIENT_OUTPUT = ".svelte-kit/output/client";
/**
 * The per-locale name chunks inlined into the built service worker, so the spec checks the map the
 * worker actually received. Read inside each test, not at import: Playwright imports spec files to
 * list them before its web server has run the build. (The Vite manifest isn't an option: CI's
 * build artifact omits hidden directories like `.vite/`.)
 */
export function builtLocaleChunks(clientDir = CLIENT_OUTPUT): Record<string, string[]> {
  const worker = readFileSync(join(clientDir, "service-worker.js"), "utf8");
  return Object.fromEntries(
    LOCALE_CODES.map((locale) => {
      const property = `[{,]\\s*["']?${locale}["']?\\s*:\\s*`;
      const list = new RegExp(`${property}\\[([^\\]]*)\\]`).exec(worker)?.[1];
      if (list !== undefined) {
        return [locale, [...list.matchAll(/["'`]([^"'`]+)["'`]/g)].map(([, path]) => path)];
      }
      // The minifier also represents longer arrays as a string followed by .split(",").
      const packed = new RegExp(`${property}(["'\`])([^"'\`]+)\\1\\.split\\(["'\`],["'\`]\\)`).exec(
        worker,
      )?.[2];
      return [locale, packed?.split(",") ?? []];
    }),
  );
}
