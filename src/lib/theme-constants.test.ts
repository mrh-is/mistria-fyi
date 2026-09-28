import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { THEME_COLORS, THEME_STORAGE_KEY } from "./theme";

// app.html and manifest.json are served as written, so they can't import the shared constants.
const appHtml = readFileSync(resolve(__dirname, "../app.html"), "utf-8");
const appCss = readFileSync(resolve(__dirname, "../app.css"), "utf-8");
const manifest = JSON.parse(
  readFileSync(resolve(__dirname, "../../static/manifest.json"), "utf-8"),
) as { background_color: string; theme_color: string };

describe("theme constants", () => {
  it("match the pre-paint scripts and theme-color meta in app.html", () => {
    expect(appHtml).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
    expect(appHtml).toContain(`<meta name="theme-color" content="${THEME_COLORS.light}" />`);
    expect(appHtml).toContain(`.content = "${THEME_COLORS.dark}"`);
  });

  it("match the manifest's light colors", () => {
    expect(manifest.theme_color).toBe(THEME_COLORS.light);
    expect(manifest.background_color).toBe(THEME_COLORS.light);
  });

  it("match each theme's --paper token", () => {
    const paper = [...appCss.matchAll(/--paper:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]);
    expect(paper).toEqual([THEME_COLORS.light, THEME_COLORS.dark]);
  });
});
