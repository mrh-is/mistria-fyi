/**
 * Theme constants shared by the theme store and its tests. `src/app.html` and
 * `static/manifest.json` can't import them, so `theme.static-files.test.ts` checks that their copies
 * match.
 */

/** localStorage key for the theme preference, also read by the pre-paint script in `app.html`. */
export const THEME_STORAGE_KEY = "mistria-fyi-theme";

/** Mobile browser chrome colors: each theme's `--paper` in `app.css`. */
export const THEME_COLORS = {
  dark: "#222226",
  light: "#f7f5f0",
} as const;
