import { readFileSync } from "node:fs";

import { LOCALE_CODES } from "../src/lib/types/locale.js";

const CLIENT_OUTPUT = ".svelte-kit/output/client";
/**
 * The per-locale name chunks inlined into the built service worker, so the spec checks the map the
 * worker actually received. Read inside each test, not at import: Playwright imports spec files to
 * list them before its web server has run the build. (The Vite manifest isn't an option: CI's
 * build artifact omits hidden directories like `.vite/`.)
 */
export function builtLocaleChunks(): Record<string, string[]> {
  const worker = readFileSync(`${CLIENT_OUTPUT}/service-worker.js`, "utf8");
  return Object.fromEntries(
    LOCALE_CODES.map((locale) => {
      const list =
        new RegExp(`[{,]\\s*["']?${locale}["']?\\s*:\\s*\\[([^\\]]*)\\]`).exec(worker)?.[1] ?? "";
      return [locale, [...list.matchAll(/["'`]([^"'`]+)["'`]/g)].map(([, path]) => path)];
    }),
  );
}
