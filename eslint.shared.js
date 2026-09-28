// Settings shared by eslint.config.js (untyped template rules) & eslint.svelte-types.config.js
// (type-aware rules for `.svelte` scripts).
import ts from "typescript-eslint";

import svelteConfig from "./svelte.config.js";

export const svelteFiles = ["**/*.svelte", "**/*.svelte.js", "**/*.svelte.ts"];

// eslint-plugin-svelte reads only these fields. Passing the whole config breaks `eslint --cache`,
// which serializes parser options and can't handle `kit.typescript.config`'s function value.
const lintSvelteConfig = {
  compilerOptions: svelteConfig.compilerOptions,
  kit: { files: svelteConfig.kit?.files },
  onwarn: svelteConfig.onwarn,
  warningFilter: svelteConfig.warningFilter,
};

export const svelteParserOptions = {
  extraFileExtensions: [".svelte"],
  parser: ts.parser,
  svelteConfig: lintSvelteConfig,
};
