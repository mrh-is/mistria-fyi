// Source-of-truth for the per-locale web fonts (issue #269). `build-locale-fonts.ts` turns this into
// generated `@font-face` CSS under `src/lib/fonts/` and a directory of woff2 chunks to upload to R2.
//
// Weights are deliberately minimal: display faces are used at 400 only, controls/annotation/data at
// 400 only, and body at 400–600. Families that ship 400/700 only still avoid faux-bold because the
// CSS font-matching algorithm resolves 600 upward to the real 700 face.

export const ASSET_ORIGIN = "https://assets.mistria.fyi";

/** R2 key prefix. Versioned per family so objects can be served with an immutable cache policy. */
export const ASSET_PREFIX = "fonts";

export type FontLocale = "ja" | "ko" | "ru" | "zh-Hans" | "zh-Hant";

export interface FontsourceFont {
  /** Fontsource CSS entry points, e.g. `400` or `400-italic`. */
  faces: readonly string[];
  locale: FontLocale;
  /** npm package name under `@fontsource/`. */
  package: string;
}

export interface SlicedFace {
  /** File name inside the `--input` directory. */
  file: string;
  style: "italic" | "normal";
  weight: number;
}

export interface SlicedFont {
  faces: readonly SlicedFace[];
  family: string;
  locale: FontLocale;
  slug: string;
  /** Upstream release; becomes part of the R2 key. */
  version: string;
}

export const FONTSOURCE_FONTS: readonly FontsourceFont[] = [
  { faces: ["400"], locale: "ja", package: "shippori-mincho" },
  { faces: ["400", "700"], locale: "ja", package: "biz-udpmincho" },
  { faces: ["400"], locale: "ja", package: "m-plus-1-code" },
  { faces: ["400"], locale: "ja", package: "m-plus-1p" },
  { faces: ["400"], locale: "zh-Hant", package: "cactus-classical-serif" },
  { faces: ["400"], locale: "zh-Hant", package: "noto-serif-tc" },
  { faces: ["400", "700"], locale: "zh-Hant", package: "lxgw-wenkai-tc" },
  { faces: ["400"], locale: "zh-Hant", package: "lxgw-wenkai-mono-tc" },
  { faces: ["400"], locale: "zh-Hant", package: "noto-sans-tc" },
  { faces: ["400", "700"], locale: "ko", package: "gowun-batang" },
  { faces: ["400"], locale: "ko", package: "nanum-gothic-coding" },
  { faces: ["400"], locale: "ko", package: "nanum-gothic" },
  { faces: ["400", "500", "600", "400-italic"], locale: "ru", package: "lora" },
  { faces: ["400"], locale: "ru", package: "golos-text" },
];

// Simplified Chinese faces that are not on Google Fonts / Fontsource. Download the release assets
// listed in docs/font-assets.md into the `--input` directory before running the build script.
// LXGW names its heaviest WenKai cut "Medium"; Google Fonts serves the same cut of WenKai TC as 700.
export const SLICED_FONTS: readonly SlicedFont[] = [
  {
    faces: [
      { file: "LXGWWenKaiGB-Regular.ttf", style: "normal", weight: 400 },
      { file: "LXGWWenKaiGB-Medium.ttf", style: "normal", weight: 700 },
    ],
    family: "LXGW WenKai GB",
    locale: "zh-Hans",
    slug: "lxgw-wenkai-gb",
    version: "1.522",
  },
  {
    faces: [{ file: "LXGWWenKaiMonoGB-Regular.ttf", style: "normal", weight: 400 }],
    family: "LXGW WenKai Mono GB",
    locale: "zh-Hans",
    slug: "lxgw-wenkai-mono-gb",
    version: "1.522",
  },
  {
    faces: [{ file: "ChillRoundGothic_Regular.otf", style: "normal", weight: 400 }],
    family: "Chill Round Gothic",
    locale: "zh-Hans",
    slug: "chill-round-gothic",
    version: "3.750",
  },
  {
    // Smiley Sans ships as a single oblique cut; it is declared upright so no synthetic slant stacks.
    faces: [{ file: "SmileySans-Oblique.ttf", style: "normal", weight: 400 }],
    family: "Smiley Sans",
    locale: "zh-Hans",
    slug: "smiley-sans",
    version: "2.0.1",
  },
];
