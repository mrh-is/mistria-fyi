import adapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const commit =
  process.env.NODE_ENV === "production"
    ? execSync("git rev-parse --short HEAD").toString().trim()
    : "dev";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
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
