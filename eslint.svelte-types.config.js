// Type-aware rules for `.svelte` `<script>` blocks, which oxlint's type-aware backend (tsgolint)
// doesn't cover. Building type information through svelte-eslint-parser is slow (over a minute on
// a 4-core machine), so this runs as its own CI job (`pnpm run lint:svelte-types`) instead of in
// `pnpm run lint`. It enables only the `@typescript-eslint` rules that need type information;
// oxlint & eslint.config.js cover everything else. Keep the options below in sync with the
// matching rules in .oxlintrc.json.
import { includeIgnoreFile } from "@eslint/compat";
import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import { fileURLToPath } from "node:url";
import ts from "typescript-eslint";

import { svelteParserOptions } from "./eslint.shared.js";

const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url));

const typeCheckedRules = Object.fromEntries(
  [...ts.configs.strictTypeCheckedOnly, ...ts.configs.stylisticTypeCheckedOnly]
    .flatMap((config) => Object.entries(config.rules ?? {}))
    .filter(([name]) => name.startsWith("@typescript-eslint/")),
);

export default defineConfig(
  includeIgnoreFile(gitignorePath),
  // Only the Svelte parser setup; eslint.config.js runs the Svelte rules.
  ...svelte.configs.base,
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        ...svelteParserOptions,
        projectService: true,
        tsconfigRootDir: fileURLToPath(new URL(".", import.meta.url)),
      },
    },
    // Every other rule's suppressions live in these files too; they aren't this pass's to judge.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    plugins: { "@typescript-eslint": ts.plugin },
    rules: {
      ...typeCheckedRules,
      "@typescript-eslint/no-unnecessary-condition": "warn",
      // {@render children()} triggers false positive
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    // shadcn-svelte generated components — vendored code, relax strict rules
    files: ["src/lib/components/ui/**/*.svelte"],
    rules: {
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
    },
  },
);
