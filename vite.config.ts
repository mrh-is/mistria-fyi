import { paraglideVitePlugin } from "@inlang/paraglide-js";
import adapter from "@sveltejs/adapter-cloudflare";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { configDefaults } from "vitest/config";

import { getAppVersion } from "./scripts/app-version.js";
import { resolveSpriteAssetBase } from "./src/lib/asset-origin.js";
import { headersFilePlugin } from "./src/lib/build/headers-file.js";
import { localeNameChunksPlugin } from "./src/lib/build/locale-name-chunks.js";
import { PARAGLIDE_OPTIONS } from "./src/lib/i18n/paraglide-options.js";
import { cspDirectives } from "./src/lib/security/csp-directives.js";
import { renderHeadersFile } from "./src/lib/security/security-headers.js";

/**
 * Where sprites load from: production, or a `PUBLIC_ASSET_ORIGIN` override (shell, `.env`, or
 * `.env.local`) for testing unuploaded sprites locally. It's read here, once, so the sprite URLs
 * and both copies of the CSP agree. Vite no longer exposes `PUBLIC_*` variables to the client.
 */
const spriteAssetBase = resolveSpriteAssetBase(
  // An empty mode skips the mode-specific `.env.<mode>` files: the override doesn't vary by mode.
  loadEnv("", import.meta.dirname, "PUBLIC_ASSET_ORIGIN").PUBLIC_ASSET_ORIGIN,
);
const contentSecurityPolicy = cspDirectives(spriteAssetBase);

/**
 * Vite resolves `#lib/*` through the nearest package.json's `imports` field. For files under
 * `pipeline/`, that's `pipeline/package.json`, which has none, so map it explicitly (the pipeline's
 * tsconfig does the same for tsx). The plain-Node test projects don't extend this config, so they
 * repeat the alias.
 */
const libAlias = [
  { find: /^#lib\//u, replacement: `${fileURLToPath(new URL("src/lib", import.meta.url))}/` },
];

const sharedTestExcludes = [
  ...configDefaults.exclude,
  "**/.worktrees/**",
  "**/.claude/worktrees/**",
  "**/.pnpm-store/**",
];

/**
 * Per-test & per-hook timeout for every project. Vitest's 5 s default is tuned for an idle host;
 * under the full parallel suite, tests that finish in 1-4 s alone (the lint-ownership ESLint &
 * oxlint probes, content counters, animation-frame batching) overrun it, so a timeout reports host
 * load rather than a wrong result (#589). A genuine hang still fails, just 30 s later.
 */
const loadTolerantTimeoutMs = 30_000;

/**
 * The root test options a plain-Node project would otherwise inherit with `extends: true`. Those
 * projects skip the app's Vite plugins (SvelteKit, Tailwind, Paraglide), so they restate these.
 */
const plainNodeTestOptions = {
  hookTimeout: loadTolerantTimeoutMs,
  isolate: true,
  restoreMocks: true,
  testTimeout: loadTolerantTimeoutMs,
  unstubGlobals: true,
};

/**
 * Cloudflare Pages caps `_routes.json` at 100 rules. The adapter's default `<files>` exclusion
 * lists every static asset individually, which can overflow that cap once `static/` holds enough
 * files (it did for the ~2,500 sprites now hosted on assets.mistria.fyi instead, see #312, #247).
 * Exclude each top-level `static/` directory with one wildcard instead, and keep top-level files
 * as individual rules. Dynamic routes (locale pages, `/api/feedback`) stay covered by the `/*`
 * include.
 */
const staticExcludes = readdirSync(path.join(import.meta.dirname, "static"), {
  withFileTypes: true,
})
  .filter((entry) => !entry.name.startsWith("."))
  .map((entry) => (entry.isDirectory() ? `/${entry.name}/*` : `/${entry.name}`));

export default defineConfig({
  build: {
    // tracker-data.json is the largest chunk: ~844 kB minified, ~75 kB gzipped as of the 1.0.5
    // data. Lazy-loading isn't viable because the user-state store and engine layer import it
    // synchronously at initialization; Vite emits it as a JSON.parse() string, the cheapest form
    // to parse. Nothing in the browser or service worker caps chunk size, so this is a tripwire:
    // it sits ~100 kB above the data so a data update that grows it markedly (the way names did
    // before they moved to per-locale chunks) triggers a fresh look instead of silently shipping.
    chunkSizeWarningLimit: 950,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Keep the data in a chunk of its own. Otherwise it shares one with whatever library
            // code every route also imports, so a game-data update re-downloads that code and a
            // dependency bump re-downloads the data.
            { name: "tracker-data", test: /\/src\/lib\/data\/tracker-data\.json$/ },
          ],
        },
      },
    },
  },
  define: {
    __SPRITE_ASSET_BASE__: JSON.stringify(spriteAssetBase),
  },
  plugins: [
    tailwindcss(),
    sveltekit({
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
      preprocess: vitePreprocess(),

      csp: { directives: contentSecurityPolicy },
      version: { name: getAppVersion() },
    }),
    localeNameChunksPlugin(),
    headersFilePlugin(renderHeadersFile(contentSecurityPolicy)),
    paraglideVitePlugin(PARAGLIDE_OPTIONS),
  ],
  resolve: { alias: libAlias },
  server: {
    // Claude Code's preview tool sets PORT when 5173 is already bound by another worktree's dev
    // server (`autoPort` in .claude/launch.json). Vite ignores PORT on its own, so read it here
    // and bind strictly so the server never drifts from the tab Claude opened.
    port: Number(process.env.PORT) || 5173,
    strictPort: Boolean(process.env.PORT),
  },
  test: {
    // Opt-in with `--coverage` (`pnpm run test:coverage`), so ordinary runs pay nothing. Scoped to
    // the domain logic, stores, & pipeline; reported, not gated.
    coverage: {
      exclude: ["**/*.test.ts", "**/*.test-harness.svelte", "pipeline/src/assets-test-setup.ts"],
      include: ["src/lib/engine/**/*.ts", "src/lib/stores/**/*.ts", "pipeline/src/**/*.ts"],
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
    },
    // Persists module transforms under node_modules/.vitest-cache, so warm runs skip most of the
    // transform work. CI restores the directory with actions/cache.
    fsModuleCache: true,
    hookTimeout: loadTolerantTimeoutMs,
    // Every file gets its own module registry; spies and stubbed globals are restored per test.
    isolate: true,
    // Each project is a tier, split by what its tests need to run. `pnpm run test` runs every
    // project except `assets`; see docs/development-workflow.md §4.
    projects: [
      {
        extends: true,
        test: {
          exclude: [
            ...sharedTestExcludes,
            "**/*.assets.test.ts",
            "**/*.client.test.ts",
            "**/*.cold.test.ts",
          ],
          include: ["src/**/*.test.ts"],
          name: "app",
          setupFiles: ["./src/vitest-setup-app-state.ts", "./src/vitest-setup-names.ts"],
        },
      },
      {
        // The data pipeline: plain Node without the app's plugins, the same environment as the
        // `assets` project.
        resolve: { alias: libAlias },
        test: {
          ...plainNodeTestOptions,
          exclude: [...sharedTestExcludes, "**/*.assets.test.ts"],
          include: ["pipeline/**/*.test.ts"],
          name: "pipeline",
        },
      },
      {
        // Build scripts, lint rules, & repo-level checks: plain Node without the app's plugins.
        resolve: { alias: libAlias },
        test: {
          ...plainNodeTestOptions,
          // CLI exclusions are overridden by inline projects, so gate this file here.
          exclude: [
            ...sharedTestExcludes,
            "**/*.assets.test.ts",
            ...(process.env.VITEST_CLEANUP_CHANGED === "false"
              ? ["scripts/cleanup-merged-worktrees.test.ts"]
              : []),
          ],
          include: ["eslint-rules/**/*.test.ts", "scripts/**/*.test.ts", "tests/**/*.test.ts"],
          name: "node",
        },
      },
      {
        extends: true,
        test: {
          // Cold-start tests own their name-cache initialization and skip all preload setup.
          // Other files, including tests that mock shared packages, use the isolated app project.
          exclude: sharedTestExcludes,
          include: ["src/**/*.cold.test.ts"],
          name: "cold",
        },
      },
      {
        extends: true,
        plugins: [svelteTesting()],
        test: {
          environment: "happy-dom",
          include: ["src/**/*.client.test.ts"],
          name: "client",
          // Warm two-worker runs are faster with threads; per-file isolation stays enabled.
          pool: "threads",
          setupFiles: [
            "./src/vitest-setup.ts",
            "./src/vitest-setup-app-state.ts",
            "./src/vitest-setup-names.ts",
          ],
        },
      },
      {
        // Needs the installed game assets, so CI never runs it; `pnpm run test` excludes it.
        resolve: { alias: libAlias },
        test: {
          ...plainNodeTestOptions,
          exclude: sharedTestExcludes,
          globalSetup: ["pipeline/src/assets-test-setup.ts"],
          include: ["**/*.assets.test.ts"],
          name: "assets",
        },
      },
    ],
    restoreMocks: true,
    testTimeout: loadTolerantTimeoutMs,
    unstubGlobals: true,
  },
});
