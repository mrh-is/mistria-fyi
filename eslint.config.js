import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import perfectionist from "eslint-plugin-perfectionist";
import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import globals from "globals";
import { fileURLToPath } from "node:url";
import ts from "typescript-eslint";

import svelteConfig from "./svelte.config.js";

const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url));

export default defineConfig(
  includeIgnoreFile(gitignorePath),
  js.configs.recommended,
  ...ts.configs.strictTypeChecked,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        extraFileExtensions: [".svelte"],
        projectService: {
          allowDefaultProject: ["src/service-worker.ts"],
        },
        tsconfigRootDir: fileURLToPath(new URL(".", import.meta.url)),
      },
    },
  },
  perfectionist.configs["recommended-natural"],
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",

      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      curly: ["error", "multi-line", "consistent"],
      eqeqeq: "error",
      "no-alert": "error",
      "no-console": "warn",
      "no-debugger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-throw-literal": "error",

      "no-unneeded-ternary": "error",
      "no-useless-rename": "error",
      "no-var": "error",
      "object-shorthand": "warn",
      // Perfectionist — customize import grouping for SvelteKit
      "perfectionist/sort-imports": [
        "error",
        {
          groups: [
            "side-effect",
            "side-effect-style",
            ["builtin", "external"],
            "internal",
            ["parent", "sibling", "index"],
            ["type-builtin", "type-external"],
            "type-internal",
            ["type-parent", "type-sibling", "type-index"],
            "unknown",
          ],
          ignoreCase: true,
          internalPattern: ["^\\$lib", "^\\$app", "^\\$env", "^\\$service-worker"],
          order: "asc",
          type: "natural",
        },
      ],
      "prefer-const": "error",
      "prefer-template": "warn",
    },
  },
  {
    // Svelte-specific overrides (must come AFTER general rules)
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        extraFileExtensions: [".svelte"],
        parser: ts.parser,
        projectService: true,
        svelteConfig,
        tsconfigRootDir: fileURLToPath(new URL(".", import.meta.url)),
      },
    },
    rules: {
      // {@render children()} triggers false positive
      "@typescript-eslint/no-unsafe-call": "off",
      // Svelte requires `let` for $props() destructuring (reactivity)
      "prefer-const": "off",
    },
  },
  {
    // Relax rules for config files (JS, no tsconfig coverage)
    files: ["*.config.{js,ts}", "*.config.*.{js,ts}"],
    ...ts.configs.disableTypeChecked,
  },
);
