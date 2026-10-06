// ESLint covers only what oxlint can't: Svelte templates. oxlint (`.oxlintrc.json`) lints every
// script, including `.svelte` `<script>` blocks; ESLint runs eslint-plugin-svelte, the template-aware
// `no-unused-vars`, and the local `no-hardcoded-ui-text` rule on `.svelte` & `.svelte.{js,ts}` files,
// without type information. See docs/development-workflow.md#linting--formatting.
import { includeIgnoreFile } from "@eslint/compat";
import { loadConfig } from "@sveltejs/load-config";
import svelte from "eslint-plugin-svelte";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import { fileURLToPath } from "node:url";
import ts from "typescript-eslint";

import noHardcodedUiText from "./eslint-rules/no-hardcoded-ui-text.ts";
// Node strips the types when it imports this TypeScript module.
import noRawInternalHref from "./eslint-rules/no-raw-internal-href.ts";
import noUntokenedClasses from "./eslint-rules/no-untokened-classes.ts";

// SvelteKit 3 reads its config from the `sveltekit()` plugin in vite.config.ts, flattened (no `kit`).
const loadedConfig = await loadConfig("./", { traverse: false });
if (!loadedConfig || !("config" in loadedConfig)) {
  throw new Error("Could not load the SvelteKit config from vite.config.ts");
}
const svelteConfig = loadedConfig.config;

// One plugin object: flat config rejects two different definitions of the same plugin name.
const localPlugin = {
  rules: {
    "no-hardcoded-ui-text": noHardcodedUiText,
    "no-raw-internal-href": noRawInternalHref,
    "no-untokened-classes": noUntokenedClasses,
  },
};

const gitignorePath = fileURLToPath(new URL(".gitignore", import.meta.url));

// eslint-plugin-svelte reads only these fields. Passing the whole config breaks `eslint --cache`,
// which serializes parser options and can't handle `kit.typescript.config`'s function value.
const lintSvelteConfig = {
  compilerOptions: svelteConfig.compilerOptions,
  kit: { files: svelteConfig.files },
  onwarn: svelteConfig.onwarn,
  warningFilter: svelteConfig.warningFilter,
};

export default defineConfig(
  includeIgnoreFile(gitignorePath),
  // Lint-ownership probes violate rules on purpose; tests/lint-ownership.test.ts lints them.
  globalIgnores(["tests/lint-probes/"]),
  ...svelte.configs.recommended,
  // Formatting belongs to oxfmt.
  ...svelte.configs.prettier,
  {
    files: ["**/*.svelte", "**/*.svelte.js", "**/*.svelte.ts"],
    languageOptions: {
      // Browser only: ESLint lints just Svelte files, which run in the client (or SSR), so
      // `process` & `Buffer` should be flagged. Node code is linted by oxlint.
      globals: { ...globals.browser },
      parserOptions: {
        extraFileExtensions: [".svelte"],
        parser: ts.parser,
        svelteConfig: lintSvelteConfig,
      },
    },
    plugins: { local: localPlugin },
    rules: {
      // Without type information, this rule can't see that `localizedHref()` returns a resolved
      // path, so it flags every localized link. `local/no-raw-internal-href` guards `href` instead.
      "local/no-raw-internal-href": "error",
      // Makes the browser-only `globals` meaningful: `process` & `Buffer` in client code are flagged.
      "no-undef": "error",
      "svelte/no-navigation-without-resolve": "off",
      // oxlint's `prefer-const` is off for these files because it can't tell runes from
      // reassignable bindings; the Svelte-aware version exempts `$props()` & friends.
      "svelte/prefer-const": "error",
    },
  },
  {
    files: ["**/*.svelte"],
    plugins: { "@typescript-eslint": ts.plugin },
    rules: {
      // oxlint sees only the `<script>` block, so it can't tell when a variable is used only in the
      // template and skips the check in `.svelte` files. svelte-eslint-parser's scope analysis can.
      // (oxlint still checks `.svelte.ts` files, which have no template.)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // AGENTS.md §6: destructure `$props()` with `let` so the bindings stay reassignable.
      "no-restricted-syntax": [
        "error",
        {
          message: "Destructure `$props()` with `let`, not `const` (AGENTS.md §6).",
          selector:
            'VariableDeclaration[kind="const"] > VariableDeclarator[init.callee.name="$props"]',
        },
      ],
    },
  },
  {
    files: ["src/**/*.svelte"],
    ignores: ["src/lib/components/ui/**", "**/*.test-harness.svelte"],
    rules: { "local/no-untokened-classes": "error" },
  },
  {
    // Cover app templates by default. Vendored primitives, dev-only pages, and fixture
    // templates are intentionally outside the user-facing localization contract.
    files: ["src/**/*.svelte"],
    ignores: ["src/lib/components/ui/**", "src/routes/dev/**", "**/*.test-harness.svelte"],
    plugins: { local: localPlugin },
    rules: { "local/no-hardcoded-ui-text": "error" },
  },
);
