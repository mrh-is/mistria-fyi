import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import perfectionist from "eslint-plugin-perfectionist";
import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import globals from "globals";
import { fileURLToPath } from "node:url";
import ts from "typescript-eslint";

import noHardcodedUiText from "./eslint-rules/no-hardcoded-ui-text.js";
import svelteConfig from "./svelte.config.js";

const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url));

// Files already migrated to Paraglide messages. The no-hardcoded-ui-text rule (see
// docs/localization.md) only applies here — turning it on repo-wide today would flag every
// not-yet-localized component. Add a file to this list in the same PR that localizes it; the
// rule then guards against future regressions in that file.
const localizedFiles = [
  "src/lib/components/ai-disclosure-dialog.svelte",
  "src/lib/components/all-completed.svelte",
  "src/lib/components/almanac-content.svelte",
  "src/lib/components/animal-cosmetics-section.svelte",
  "src/lib/components/animal-subcategory.svelte",
  "src/lib/components/animal-variants-section.svelte",
  "src/lib/components/confirm-spoiler-dialog.svelte",
  "src/lib/components/cosmetics-content.svelte",
  "src/lib/components/dates-section.svelte",
  "src/lib/components/expandable-section.svelte",
  "src/lib/components/feedback-panel.svelte",
  "src/lib/components/feedback-picker.svelte",
  "src/lib/components/foldout-panel.svelte",
  "src/lib/components/mine-floor-record.svelte",
  "src/lib/components/mines-content.svelte",
  "src/lib/components/museum-content.svelte",
  "src/lib/components/page-header.svelte",
  "src/lib/components/pet-collectibles-section.svelte",
  "src/lib/components/quests-content.svelte",
  "src/lib/components/quick-settings-language-picker.svelte",
  "src/lib/components/quick-settings-panel.svelte",
  "src/lib/components/quick-settings-theme-picker.svelte",
  "src/lib/components/recipes-content.svelte",
  "src/lib/components/renown-current-record.svelte",
  "src/lib/components/search-results.svelte",
  "src/lib/components/skill-row.svelte",
  "src/lib/components/skills-content.svelte",
  "src/lib/components/source-explainer-dialog.svelte",
  "src/lib/components/toolbar-footer.svelte",
  "src/lib/components/tracker-row.svelte",
  "src/lib/components/update-prompt.svelte",
  "src/lib/components/villager-alphabet-index.svelte",
  "src/lib/components/villager-record.svelte",
  "src/lib/components/villager-roster.svelte",
  "src/lib/components/visibility-panel.svelte",
  "src/lib/components/welcome-card.svelte",
  "src/routes/(category)/renown/+page.svelte",
  "src/routes/(category)/renown/rank-record.svelte",
  "src/routes/about/+page.svelte",
  "src/routes/data/+page.svelte",
  "src/routes/data/backup-card.svelte",
  "src/routes/data/danger-zone-card.svelte",
  "src/routes/data/import-card.svelte",
  "src/routes/data/merge-summary.svelte",
  "src/routes/data/transfer-card.svelte",
  "src/routes/privacy/+page.svelte",
];

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
  {
    // Local ESLint rule implementations — plain JS, no tsconfig coverage
    files: ["eslint-rules/**/*.js"],
    ...ts.configs.disableTypeChecked,
  },
  {
    // See docs/localization.md — catches hardcoded UI text only in files already migrated
    // to Paraglide messages (localizedFiles above).
    files: localizedFiles,
    plugins: { local: { rules: { "no-hardcoded-ui-text": noHardcodedUiText } } },
    rules: { "local/no-hardcoded-ui-text": "error" },
  },
);
