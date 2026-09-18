import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const appCss = readFileSync(resolve(repositoryRoot, "src/app.css"), "utf8");

const FONT_ROLES = ["display", "body", "controls", "annotation", "data"] as const;
const FONT_LOCALES = ["ja", "zh-Hans", "zh-Hant", "ko", "ru"] as const;
const BASE_FAMILIES = new Set([
  "Courier New",
  "Fragment Mono",
  "Georgia",
  "IBM Plex Mono",
  "Instrument Serif",
  "Petrona",
  "Satoshi",
]);

function declaredFamilies(locale: string): Set<string> {
  const css = readFileSync(
    resolve(repositoryRoot, `src/lib/fonts/locale-fonts-${locale}.css`),
    "utf8",
  );
  return new Set([...css.matchAll(/font-family:"([^"]+)"/g)].map(([, family]) => family));
}

/** Collects the `--font-*` declarations from every `html:lang(<locale>)` block that names the locale. */
function localeFontRoles(locale: string): Map<string, string> {
  const roles = new Map<string, string>();
  const blocks = appCss.matchAll(/((?:html:lang\([\w-]+\),?\s*)+)\{([^}]*)\}/g);
  for (const [, selectors, body] of blocks) {
    if (!selectors.includes(`html:lang(${locale})`)) continue;
    for (const [, role, value] of body.matchAll(/--font-([\w-]+):\s*([^;]+);/g)) {
      roles.set(role, value);
    }
  }
  return roles;
}

describe("locale font stacks", () => {
  it.each(FONT_LOCALES)("%s overrides all five font roles", (locale) => {
    const roles = localeFontRoles(locale);
    for (const role of FONT_ROLES) {
      expect(roles.get(role), `--font-${role} for ${locale}`).toBeDefined();
    }
  });

  it.each(["en", "es", "fr"])("%s keeps the base stacks", (locale) => {
    expect(appCss).not.toContain(`html:lang(${locale})`);
  });

  it.each(FONT_LOCALES)("%s only names families its generated stylesheet declares", (locale) => {
    const declared = declaredFamilies(locale);
    for (const [role, stack] of localeFontRoles(locale)) {
      if (!FONT_ROLES.includes(role as (typeof FONT_ROLES)[number])) continue;
      for (const [, family] of stack.matchAll(/"([^"]+)"/g)) {
        if (BASE_FAMILIES.has(family)) continue;
        expect(declared.has(family), `${family} in --font-${role} for ${locale}`).toBe(true);
      }
    }
  });

  it("keeps CJK display upright and Cyrillic display italic", () => {
    for (const locale of ["ja", "zh-Hans", "zh-Hant", "ko"]) {
      expect(localeFontRoles(locale).get("display-style")).toBe("normal");
    }
    expect(localeFontRoles("ru").get("display-style")).toBeUndefined();
    expect(appCss).toMatch(/--font-display-style: italic;/);
  });

  it("gives Russian a Cyrillic-complete stack with no Latin-only faces", () => {
    const stacks = [...localeFontRoles("ru").values()].join(" ");
    for (const family of ["Petrona", "Instrument Serif", "Fragment Mono", "Satoshi"]) {
      expect(stacks).not.toContain(`"${family}"`);
    }
  });

  it("pins the brand mark to Instrument Serif in every locale", () => {
    expect(appCss).toMatch(/--font-brand: "Instrument Serif"/);
    for (const locale of FONT_LOCALES) {
      expect(localeFontRoles(locale).has("brand")).toBe(false);
    }
  });

  it.each(FONT_LOCALES)("%s stylesheet only references versioned R2 font chunks", (locale) => {
    const css = readFileSync(
      resolve(repositoryRoot, `src/lib/fonts/locale-fonts-${locale}.css`),
      "utf8",
    );
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(([, url]) => url);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(
        /^https:\/\/assets\.mistria\.fyi\/fonts\/[\w-]+-\d+(\.\d+)*\/[^/]+\.woff2$/,
      );
    }
  });
});
