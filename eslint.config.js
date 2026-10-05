// ESLint covers only what oxlint can't: Svelte templates. oxlint (`.oxlintrc.json`) lints every
// script, including `.svelte` `<script>` blocks; ESLint runs eslint-plugin-svelte, the template-aware
// `no-unused-vars`, and the local `no-hardcoded-ui-text` rule on `.svelte` & `.svelte.{js,ts}` files,
// without type information. See docs/development-workflow.md#linting--formatting.
import { includeIgnoreFile } from "@eslint/compat";
import { loadConfig } from "@sveltejs/load-config";
import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import globals from "globals";
import { fileURLToPath } from "node:url";
import ts from "typescript-eslint";

import noHardcodedUiText from "./eslint-rules/no-hardcoded-ui-text.js";

// SvelteKit 3 reads its config from the `sveltekit()` plugin in vite.config.ts, flattened (no `kit`).
const loadedConfig = await loadConfig("./", { traverse: false });
if (!loadedConfig || !("config" in loadedConfig)) {
  throw new Error("Could not load the SvelteKit config from vite.config.ts");
}
const svelteConfig = loadedConfig.config;

const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url));

// eslint-plugin-svelte reads only these fields. Passing the whole config breaks `eslint --cache`,
// which serializes parser options and can't handle `kit.typescript.config`'s function value.
const lintSvelteConfig = {
  compilerOptions: svelteConfig.compilerOptions,
  kit: { files: svelteConfig.files },
  onwarn: svelteConfig.onwarn,
  warningFilter: svelteConfig.warningFilter,
};

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
  ...svelte.configs.recommended,
  // Formatting belongs to oxfmt.
  ...svelte.configs.prettier,
  {
    files: ["**/*.svelte", "**/*.svelte.js", "**/*.svelte.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        extraFileExtensions: [".svelte"],
        parser: ts.parser,
        svelteConfig: lintSvelteConfig,
      },
    },
    rules: {
      // Without type information, this rule can't see that `localizedHref()` returns a resolved
      // path, so it flags every localized link. Links go through `localizedHref()` by convention.
      "svelte/no-navigation-without-resolve": "off",
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
    },
  },
  {
    // See docs/localization.md — catches hardcoded UI text only in files already migrated
    // to Paraglide messages (localizedFiles above).
    files: localizedFiles,
    plugins: { local: { rules: { "no-hardcoded-ui-text": noHardcodedUiText } } },
    rules: { "local/no-hardcoded-ui-text": "error" },
  },
);
