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

// Run in the `mocked` project, with isolation preserved. See that project's comment.
const isolatedTests = [
  "src/lib/data/names.fallback.test.ts",
  "src/lib/data/names.loading.test.ts",
  "src/lib/utils/celebrate.test.ts",
  "src/lib/utils/undo-toast.test.ts",
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
            ...isolatedTests,
          ],
          include: ["src/**/*.test.ts"],
          isolate: false,
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
          isolate: false,
          name: "node",
        },
      },
      {
        extends: true,
        test: {
          // These files use vi.mock() on shared packages (canvas-confetti, svelte-sonner) or reset
          // the module registry to observe `names.js` from a cold start. Under the server project's
          // `isolate: false`, a module cached unmocked by another file in the same worker can win
          // the race and leave the mock unapplied, and a reset registry would hand later files an
          // unloaded name cache, so they need real isolation. This project deliberately has no
          // `vitest-setup-names.ts`: the names tests load exactly the chunks they mean to test.
          include: isolatedTests,
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
          name: "assets",
        },
      },
    ],
  },
});
