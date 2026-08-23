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
  ...ts.configs.stylisticTypeChecked,
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
        projectService: true,
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
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      curly: ["error", "multi-line", "consistent"],
      eqeqeq: "error",
      "no-alert": "error",
      "no-console": "warn",
      "no-debugger": "error",
      "no-eval": "error",
      "no-unneeded-ternary": "error",
      "no-useless-rename": "error",
      "no-var": "error",
      "object-shorthand": "error",
      // Perfectionist — customize import grouping for SvelteKit
      "perfectionist/sort-imports": [
        "error",
        {
          type: "natural",
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
          tsconfig: { rootDir: "." },
        },
      ],
      "perfectionist/sort-object-types": [
        "error",
        {
          customGroups: [
            { elementNamePattern: "^start$", groupName: "range-start" },
            { elementNamePattern: "^end$", groupName: "range-end" },
            { elementNamePattern: "^type$", groupName: "type-discriminator" },
          ],
          groups: ["type-discriminator", "range-start", "range-end", "unknown"],
        },
      ],
      "perfectionist/sort-objects": [
        "error",
        {
          customGroups: [
            { elementNamePattern: "^start$", groupName: "range-start" },
            { elementNamePattern: "^end$", groupName: "range-end" },
            { elementNamePattern: "^type$", groupName: "type-discriminator" },
          ],
          groups: ["type-discriminator", "range-start", "range-end", "unknown"],
          partitionByNewLine: true,
        },
      ],
      "prefer-const": "error",
      "prefer-template": "error",
      "sort-keys": "off",
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
    // Pipeline is a CLI tool — console output is intentional, and game data
    // is loosely typed so defensive checks against `unknown` casts are valid
    files: ["pipeline/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "no-console": "off",
    },
  },
  {
    // Scripts are utility/CLI files — console output and defensive checks are intentional
    files: ["scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "no-console": "off",
    },
  },
  {
    // shadcn-svelte generated components — vendored code, relax strict rules
    files: ["src/lib/components/ui/**/*.svelte", "src/lib/components/ui/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "perfectionist/sort-imports": "off",
      "perfectionist/sort-named-exports": "off",
      "perfectionist/sort-object-types": "off",
      "perfectionist/sort-objects": "off",
      "svelte/no-navigation-without-resolve": "off",
    },
  },
  {
    // Service worker uses a separate TS environment (webworker lib) not covered by the project
    // service, so disable type-checked rules to avoid "not found by project service" errors.
    files: ["src/service-worker.ts"],
    ...ts.configs.disableTypeChecked,
  },
  {
    // Relax rules for config files (JS, no tsconfig coverage)
    files: ["*.config.{js,ts}", "*.config.*.{js,ts}"],
    ...ts.configs.disableTypeChecked,
  },
);
