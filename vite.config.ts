import "#scripts/lib/require-pinned-node";

import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { configDefaults } from "vitest/config";

import { getAppVersion } from "./scripts/app-version.js";
import RelayFirstSequencer from "./scripts/vitest-relay-sequencer.js";
import { svelteCssCachePlugin } from "./scripts/vitest-svelte-css-cache.js";
import { configureVitestWranglerEnv } from "./scripts/vitest-wrangler-env.js";
import { resolveSpriteAssetBase } from "./src/lib/asset-origin.js";
import { withBarePathStubs } from "./src/lib/build/bare-path-stubs.js";
import { withHeadersFile } from "./src/lib/build/headers-file.js";
import { licensesPlugin, noticeBlock } from "./src/lib/build/licenses.js";
import { localeNameChunksPlugin } from "./src/lib/build/locale-name-chunks.js";
import { offlinePagePlugin } from "./src/lib/build/offline-page.js";
import { PARAGLIDE_OPTIONS } from "./src/lib/i18n/paraglide-options.js";
import { PRERENDER_ENTRIES } from "./src/lib/i18n/prerender-entries.js";
import { APP_DIRECTORY } from "./src/lib/pwa/config.js";
import { cspDirectives } from "./src/lib/security/csp-directives.js";

const wranglerTestDirectory = configureVitestWranglerEnv();
if (wranglerTestDirectory) {
  process.once("exit", () => rmSync(wranglerTestDirectory, { force: true, recursive: true }));
}
// Wrangler resolves its log path at import time. A dynamic import also preserves this ordering
// when Vite bundles the config; a static adapter import would run before the setup above.
const { default: adapter } = await import("@sveltejs/adapter-cloudflare");

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
 * Whether this is a Cloudflare Pages build of the production branch. Pages sets `CF_PAGES_BRANCH`
 * in the build environment only, so it's fixed here: anything else (previews, local builds, dev, &
 * tests) runs feedback as a dry run.
 */
const isProductionDeployment = process.env.CF_PAGES_BRANCH === "main";

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
  restoreMocks: true,
  testTimeout: loadTolerantTimeoutMs,
  unstubEnvs: true,
  unstubGlobals: true,
};

/**
 * Files in a shared-registry project reuse one module graph per worker instead of re-importing
 * tracker data, names, & Svelte per file; that import & setup work was most of the app project's
 * time (#707). Spies, stubbed globals, & stubbed environment variables still reset per test, but a
 * module mock would leak into later files, so a file that mocks or resets modules must opt into
 * isolation with the `*.isolated.test.ts` (or `*.isolated.client.test.ts`) suffix; the pipeline
 * has no isolated project yet. `tests/vitest-isolation.test.ts` enforces that.
 */
const sharedRegistry = { isolate: false };

/** happy-dom & Testing Library, shared by the `client` & `client-isolated` projects. */
const clientTestOptions = {
  environment: "happy-dom" as const,
  // Warm two-worker runs are faster with threads.
  pool: "threads" as const,
  setupFiles: [
    "./src/vitest-setup.ts",
    "./src/vitest-setup-app-state.ts",
    "./src/vitest-setup-names.ts",
  ],
};

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
    __PRODUCTION_DEPLOYMENT__: JSON.stringify(isProductionDeployment),
    __SPRITE_ASSET_BASE__: JSON.stringify(spriteAssetBase),
    // Save file sync stays hidden on the production site until it launches (#291).
    __SYNC_ENABLED__: JSON.stringify(!isProductionDeployment),
  },
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter: withBarePathStubs(
        withHeadersFile(
          adapter({
            // Concurrent preview servers (the Playwright suites, #19) must not share Miniflare's
            // default `.wrangler/state` SQLite files, so scripts/playwright-preview.ts hands each one
            // its own directory.
            platformProxy: process.env.MISTRIA_PREVIEW_PERSIST_DIR
              ? { persist: { path: process.env.MISTRIA_PREVIEW_PERSIST_DIR } }
              : {},
            // Every page is prerendered and every bare path is a static stub or a `_redirects` rule,
            // so only `/api` needs the Function. An include list stays one rule however many pages
            // there are; Pages caps `_routes.json` at 100, and excluding each prerendered page
            // would overflow it. Anything else is a static file or the not-found page.
            routes: { exclude: [], include: ["/api/*"] },
          }),
          contentSecurityPolicy,
        ),
      ),
      preprocess: vitePreprocess(),

      appDir: APP_DIRECTORY,
      csp: { directives: contentSecurityPolicy },
      prerender: { entries: PRERENDER_ENTRIES },
      version: { name: getAppVersion(), pollInterval: 600_000 },
    }),
    localeNameChunksPlugin(),
    offlinePagePlugin(),
    licensesPlugin({
      // Paraglide compiles its runtime into src/lib/paraglide/ from this package.
      generatedFrom: { "src/lib/paraglide/": "@inlang/paraglide-js" },
      stylesheets: ["src/app.css"],
      vendored: [
        {
          declared: "MIT",
          licenseText: () =>
            noticeBlock(
              readFileSync(path.join(import.meta.dirname, "THIRD-PARTY-NOTICES.md"), "utf8"),
              "## Vendored UI components",
            ),
          name: "shadcn-svelte (src/lib/components/ui)",
          prefix: "src/lib/components/ui/",
        },
      ],
    }),
    paraglideVitePlugin(PARAGLIDE_OPTIONS),
    svelteCssCachePlugin(),
  ],
  resolve: { alias: libAlias },
  server: {
    // Claude Code's preview tool sets PORT when 5173 is already bound by another worktree's dev
    // server (`autoPort` in .claude/launch.json). Vite ignores PORT on its own, so read it here
    // and bind strictly so the server never drifts from the tab Claude opened.
    port: Number(process.env.PORT) || 5173,
    strictPort: Boolean(process.env.PORT),
    watch: {
      // Miniflare (the adapter's platform proxy) writes its SQLite state under `.wrangler/` as the
      // dev server starts. Paraglide's plugin recompiles on any watch event that arrives before its
      // first build finishes, so those writes made it rewrite `src/lib/paraglide` mid-request; the
      // SSR reload that followed swapped Svelte instances under the first render and failed it (#91).
      ignored: ["**/.wrangler/**"],
    },
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
            "**/*.isolated.test.ts",
          ],
          include: ["src/**/*.test.ts"],
          name: "app",
          setupFiles: ["./src/vitest-setup-app-state.ts", "./src/vitest-setup-names.ts"],
          ...sharedRegistry,
        },
      },
      {
        // The app project's environment, with a fresh module registry per file for tests that
        // mock or reset modules.
        extends: true,
        test: {
          exclude: sharedTestExcludes,
          include: ["src/**/*.isolated.test.ts"],
          name: "isolated",
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
          ...sharedRegistry,
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
            "**/*.isolated.test.ts",
            ...(process.env.VITEST_CLEANUP_CHANGED === "false"
              ? ["scripts/cleanup-merged-worktrees.test.ts"]
              : []),
          ],
          include: [
            "eslint-rules/**/*.test.ts",
            "scripts/**/*.test.ts",
            "tests/**/*.test.ts",
            "relay/**/*.test.ts",
          ],
          name: "node",
          ...sharedRegistry,
        },
      },
      {
        // The `node` project's environment, with a fresh module registry per file for tests that
        // mock or reset modules.
        resolve: { alias: libAlias },
        test: {
          ...plainNodeTestOptions,
          exclude: sharedTestExcludes,
          include: [
            "eslint-rules/**/*.isolated.test.ts",
            "scripts/**/*.isolated.test.ts",
            "tests/**/*.isolated.test.ts",
          ],
          name: "node-isolated",
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
          ...clientTestOptions,
          exclude: [...sharedTestExcludes, "**/*.isolated.client.test.ts"],
          include: ["src/**/*.client.test.ts"],
          name: "client",
          ...sharedRegistry,
        },
      },
      {
        extends: true,
        plugins: [svelteTesting()],
        test: {
          ...clientTestOptions,
          exclude: sharedTestExcludes,
          include: ["src/**/*.isolated.client.test.ts"],
          name: "client-isolated",
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
    sequence: { sequencer: RelayFirstSequencer },
    testTimeout: loadTolerantTimeoutMs,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
