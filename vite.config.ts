import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

import { localeNameChunksPlugin } from "./src/lib/build/locale-name-chunks.js";
import { LOCALE_CODES } from "./src/lib/types/locale.js";

// All 8 locales are prefixed symmetrically, including the base locale "en" — there is no
// unprefixed default. Paraglide's built-in default pattern never prefixes the base locale, so a
// custom pattern is required to opt every locale into a prefix. The root "/" pattern is listed
// separately so each locale's home page resolves to `/<locale>` rather than `/<locale>/`.
const localizedRootPattern: [string, string][] = LOCALE_CODES.map((locale) => [
  locale,
  `/${locale}`,
]);
const localizedCatchAllPattern: [string, string][] = LOCALE_CODES.map((locale) => [
  locale,
  `/${locale}/:path(.*)?`,
]);

const sharedTestExcludes = [
  ...configDefaults.exclude,
  "**/.worktrees/**",
  "**/.claude/worktrees/**",
  "**/.pnpm-store/**",
];

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
  // Vite only exposes VITE_-prefixed vars via import.meta.env by default. PUBLIC_ASSET_ORIGIN
  // (src/lib/sprites/sprite-url.ts) uses SvelteKit's own "PUBLIC_" convention, so it must be added
  // here too — SvelteKit's $env/static/public requires the var to be declared at build time, which
  // breaks an optional override with no committed .env file.
  envPrefix: ["VITE_", "PUBLIC_"],
  plugins: [
    tailwindcss(),
    sveltekit(),
    localeNameChunksPlugin(),
    paraglideVitePlugin({
      outdir: "./src/lib/paraglide",
      project: "./project.inlang",
      // /api/* is a JSON endpoint and /sitemap.xml is a prerendered SEO file — neither is a
      // player-facing page, and neither is ever locale-prefixed.
      routeStrategies: [
        { exclude: true, match: "/api/:path(.*)?" },
        { exclude: true, match: "/sitemap.xml" },
      ],
      strategy: ["url", "cookie", "baseLocale"],
      urlPatterns: [
        { localized: localizedRootPattern, pattern: "/" },
        { localized: localizedCatchAllPattern, pattern: "/:path(.*)?" },
      ],
    }),
  ],
  server: {
    // Claude Code's preview tool sets PORT when 5173 is already bound by another worktree's dev
    // server (`autoPort` in .claude/launch.json). Vite ignores PORT on its own, so read it here
    // and bind strictly so the server never drifts from the tab Claude opened.
    port: Number(process.env.PORT) || 5173,
    strictPort: Boolean(process.env.PORT),
  },
  test: {
    // Persists module transforms under node_modules/.vitest-cache, so warm runs skip most of the
    // transform work. CI restores the directory with actions/cache.
    fsModuleCache: true,
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
        // Pipeline, build scripts, & repo-level checks: plain Node, no SvelteKit stand-ins.
        extends: true,
        test: {
          exclude: [...sharedTestExcludes, "**/*.assets.test.ts"],
          include: ["pipeline/**/*.test.ts", "scripts/**/*.test.ts", "tests/**/*.test.ts"],
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
          name: "mocked",
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
        resolve: {
          alias: {
            $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
          },
        },
        test: {
          exclude: sharedTestExcludes,
          globalSetup: ["pipeline/src/assets-test-setup.ts"],
          include: ["**/*.assets.test.ts"],
          isolate: true,
          name: "assets",
          restoreMocks: true,
          unstubGlobals: true,
        },
      },
    ],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
