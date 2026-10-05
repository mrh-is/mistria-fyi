import { relative } from "node:path";

import type { Configuration } from "lint-staged";

// Single-quote each path so spaces & shell metacharacters survive the command string.
const quote = (files: readonly string[]): string =>
  files.map((file) => `'${file.replaceAll("'", String.raw`'\''`)}'`).join(" ");

// `pnpm run lint` runs Stylelint over src/**/*.{css,svelte} only; mirror that scope.
const inStylelintScope = (file: string): boolean => {
  const rel = relative(process.cwd(), file);
  return rel.startsWith("src/") && /\.(css|svelte)$/.test(rel);
};

export default {
  "*.{js,ts,svelte}": (files) => {
    const svelteFiles = files.filter((f) => /\.svelte(\.[jt]s)?$/.test(f));
    const styleFiles = files.filter((f) => f.endsWith(".svelte") && inStylelintScope(f));
    return [
      `oxfmt --no-error-on-unmatched-pattern ${quote(files)}`,
      `oxlint --type-aware --fix ${quote(files)}`,
      ...(svelteFiles.length > 0 ? [`eslint --fix ${quote(svelteFiles)}`] : []),
      ...(styleFiles.length > 0 ? [`stylelint --fix ${quote(styleFiles)}`] : []),
    ];
  },
  "*.{json,jsonc,md,html,yaml,yml}": (files) => [
    `oxfmt --no-error-on-unmatched-pattern ${quote(files)}`,
  ],
  "*.css": (files) => {
    const styleFiles = files.filter((f) => inStylelintScope(f));
    return [
      `oxfmt --no-error-on-unmatched-pattern ${quote(files)}`,
      ...(styleFiles.length > 0 ? [`stylelint --fix ${quote(styleFiles)}`] : []),
    ];
  },
} as Configuration;
