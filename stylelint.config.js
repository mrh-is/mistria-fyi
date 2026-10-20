// Drift prevention for scoped CSS, not a style guide: these rules only keep colors, type sizes,
// shadows, and radii on the design tokens in src/app.css. See docs/styling.md.
/** @type {import("stylelint").Config} */
const config = {
  ignoreFiles: [
    // Where the tokens are defined, so it's the one place literals belong.
    "src/app.css",
    // The ui/ components, forked from shadcn-svelte (see docs/decisions/2026-10-20-own-ui-components.md).
    "src/lib/components/ui/**",
    // Generated.
    "src/lib/fonts/**",
    "src/lib/paraglide/**",
  ],
  overrides: [{ customSyntax: "postcss-html", files: ["**/*.svelte"] }],
  // Every disable comment must say why (`-- reason`), name its rules, and still be needed.
  reportDescriptionlessDisables: true,
  reportInvalidScopeDisables: true,
  reportNeedlessDisables: true,
  rules: {
    "color-named": "never",
    "color-no-hex": true,
    "declaration-property-unit-disallowed-list": {
      "/^border(-.+)?-radius$/": ["px", "rem"],
      "box-shadow": ["px", "rem"],
      "font-size": ["px", "rem"],
    },
    "function-disallowed-list": [
      "color",
      "hsl",
      "hsla",
      "hwb",
      "lab",
      "lch",
      "oklab",
      "oklch",
      "rgb",
      "rgba",
    ],
  },
};

export default config;
