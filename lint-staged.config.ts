import type { Configuration } from "lint-staged";

export default {
  "*.{js,ts,svelte}": (files) => {
    const svelteFiles = files.filter((f) => /\.svelte(\.[jt]s)?$/.test(f));
    return [
      `oxfmt --no-error-on-unmatched-pattern ${files.join(" ")}`,
      `oxlint --type-aware --fix ${files.join(" ")}`,
      ...(svelteFiles.length > 0 ? [`eslint --fix ${svelteFiles.join(" ")}`] : []),
    ];
  },
  "*.{json,jsonc,md,css,html,yaml}": "oxfmt --no-error-on-unmatched-pattern",
} as Configuration;
