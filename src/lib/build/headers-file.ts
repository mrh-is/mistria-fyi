import { writeFileSync } from "node:fs";
import path from "node:path";

import type { Plugin } from "vite";

/**
 * Writes the Cloudflare Pages `_headers` file at the start of a production build.
 * `@sveltejs/adapter-cloudflare` reads `_headers` from the working directory when it adapts the
 * build, after every Vite environment has run, and copies it (plus its own cache rules) into the
 * output. Generating it here keeps the static-file CSP and the rendered-page CSP one source; the
 * file is gitignored so a hand edit can't drift from it.
 */
export function headersFilePlugin(content: string, directory = process.cwd()): Plugin {
  return {
    apply: "build",
    buildStart() {
      writeFileSync(path.join(directory, "_headers"), content);
    },
    name: "mfg:headers-file",
  };
}
