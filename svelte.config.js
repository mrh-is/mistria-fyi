import adapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { readdirSync } from "node:fs";

import { getAppVersion } from "./scripts/app-version.js";

/**
 * Cloudflare Pages caps `_routes.json` at 100 rules. The adapter's default `<files>` exclusion
 * lists every static asset individually, which can overflow that cap once `static/` holds enough
 * files (it did for the ~2,500 sprites now hosted on assets.mistria.fyi instead, see #312, #247).
 * Exclude each top-level `static/` directory with one wildcard instead, and keep top-level files
 * as individual rules. Dynamic routes (locale pages, `/api/feedback`) stay covered by the `/*`
 * include.
 */
const staticExcludes = readdirSync("static", { withFileTypes: true })
  .filter((entry) => !entry.name.startsWith("."))
  .map((entry) => (entry.isDirectory() ? `/${entry.name}/*` : `/${entry.name}`));

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      routes: {
        exclude: [
          "<build>",
          "<prerendered>",
          "<redirects>",
          "/service-worker.js",
          ...staticExcludes,
        ],
        include: ["/*"],
      },
    }),
    csp: {
      directives: {
        "base-uri": ["self"],
        "connect-src": ["self", "https://challenges.cloudflare.com"],
        "default-src": ["none"],
        "font-src": ["self", "https://assets.mistria.fyi"],
        "form-action": ["self"],
        "frame-ancestors": ["none"],
        "frame-src": ["https://challenges.cloudflare.com"],
        "img-src": ["self", "data:", "blob:", "https://assets.mistria.fyi"],
        "manifest-src": ["self"],
        "object-src": ["none"],
        "script-src": ["self", "https://challenges.cloudflare.com"],
        "style-src": ["self", "unsafe-inline"],
        "worker-src": ["self", "blob:"],
      },
    },
    typescript: {
      config: (config) => {
        config.include.push("../scripts/**/*.ts");
      },
    },
    version: { name: getAppVersion() },
  },

  preprocess: vitePreprocess(),
};

export default config;
