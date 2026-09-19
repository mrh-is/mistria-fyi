import adapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const commit =
  process.env.NODE_ENV === "production"
    ? execSync("git rev-parse --short HEAD").toString().trim()
    : "dev";

/**
 * Cloudflare Pages caps `_routes.json` at 100 rules. The adapter's default `<files>` exclusion
 * lists every static asset individually, so `static/sprites/` (~2,500 files) overflows the cap
 * and the adapter silently drops the excess; those sprites then invoke the Function on every
 * request. Exclude each top-level `static/` directory with one wildcard instead, and keep
 * top-level files as individual rules. Dynamic routes (locale pages, `/api/feedback`) stay
 * covered by the `/*` include. See #312; #247 retires the sprite rule once sprites leave `static/`.
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
        "img-src": ["self", "data:", "blob:"],
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
    version: { name: `${pkg.version} (${commit})` },
  },

  preprocess: vitePreprocess(),
};

export default config;
