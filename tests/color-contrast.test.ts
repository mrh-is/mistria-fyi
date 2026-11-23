import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/app.css", import.meta.url), "utf8");

type Rgb = [number, number, number];

function contrast(first: Rgb, second: Rgb): number {
  const [dark, light] = [luminance(first), luminance(second)].toSorted((a, b) => a - b);
  return (light + 0.05) / (dark + 0.05);
}

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16) / 255,
    Number.parseInt(h.slice(2, 4), 16) / 255,
    Number.parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function luminance(rgb: Rgb): number {
  const linear = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  ) as Rgb;
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function parseBlock(selector: string): Record<string, string> {
  const block = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1];
  if (!block) throw new Error(`Theme not found: ${selector}`);

  const tokens: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(
    /--([\w-]+):\s*(#[0-9a-fA-F]{6}|var\(--[\w-]+\))/g,
  )) {
    tokens[name] = value;
  }
  return tokens;
}

/** `color-mix(in srgb, top percent%, bottom)`, as the components composite their tints. */
function mix(top: Rgb, percent: number, bottom: Rgb): Rgb {
  const p = percent / 100;
  return [0, 1, 2].map((i) => top[i] * p + bottom[i] * (1 - p)) as Rgb;
}

function resolveColor(tokens: Record<string, string>, name: string): Rgb {
  let value = tokens[name];
  if (!value) throw new Error(`Token not found: ${name}`);

  const seen = new Set<string>();
  while (value.startsWith("var(--")) {
    const ref = value.slice(6, -1);
    if (seen.has(ref)) throw new Error(`Circular reference: ${name}`);
    seen.add(ref);
    value = tokens[ref];
    if (!value) throw new Error(`Unresolved reference: ${ref} (from ${name})`);
  }

  return hexToRgb(value);
}

describe("theme contrast tokens", () => {
  const lightTokens = parseBlock(":root");
  const darkOverrides = parseBlock(String.raw`\.dark`);
  const darkTokens = { ...lightTokens, ...darkOverrides };

  it.each([
    ["light", lightTokens],
    ["dark", darkOverrides],
  ] as const)("%s theme's pencil marks read on paper", (_, tokens) => {
    for (let level = 1; level <= 10; level++) {
      const ink = resolveColor(tokens, `color-heart-level-${level}`);
      expect(
        contrast(ink, resolveColor(tokens, "color-paper")),
        `level ${level}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it.each([
    ["light", lightTokens],
    ["dark", darkTokens],
  ] as const)("%s theme meets intended text and non-text combinations", (_, tokens) => {
    const color = (token: string) => resolveColor(tokens, token);
    const textSurfaces = ["background", "card", "muted", "accent"];

    expect(contrast(color("primary-foreground"), color("primary"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color("destructive"), color("background"))).toBeGreaterThanOrEqual(4.5);
    for (const surface of textSurfaces) {
      expect(contrast(color("foreground"), color(surface))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color("muted-foreground"), color(surface))).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(color("ring"), color("background"))).toBeGreaterThanOrEqual(3);
    expect(contrast(color("border"), color("background"))).toBeGreaterThanOrEqual(3);
    expect(contrast(color("input"), color("background"))).toBeGreaterThanOrEqual(3);
  });

  const categories = [
    "villagers",
    "quests",
    "renown",
    "museum",
    "skills",
    "cosmetics",
    "almanac",
    "animals",
    "recipes",
    "mines",
  ];

  it.each([
    ["light", lightTokens],
    ["dark", darkTokens],
  ] as const)("%s theme's category tabs & words read", (_, tokens) => {
    const color = (token: string) => resolveColor(tokens, token);
    for (const key of categories) {
      // Every tab & ribbon in a theme takes the same letter ink.
      expect(
        contrast(color("color-ribbon-foreground"), color(`color-category-${key}`)),
        `${key} tab`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(color(`color-category-${key}-text`), color("color-paper")),
        `${key} text`,
      ).toBeGreaterThanOrEqual(4.5);
      // An active filter chip: ink on a 14% tint of the category over raised paper.
      expect(
        contrast(
          color("color-ink"),
          mix(color(`color-category-${key}`), 14, color("color-paper-raised")),
        ),
        `${key} chip`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ["light", lightTokens],
    ["dark", darkTokens],
  ] as const)("%s theme's tinted & filled pairs read", (_, tokens) => {
    const color = (token: string) => resolveColor(tokens, token);

    // A filled destructive action, at rest & at its 90% hover over the dialog.
    expect(contrast(color("destructive-foreground"), color("destructive"))).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrast(color("destructive-foreground"), mix(color("destructive"), 90, color("background"))),
    ).toBeGreaterThanOrEqual(4.5);

    // The 10px villager index letter on its 12% red wash.
    expect(
      contrast(
        color("color-category-villagers-text"),
        mix(color("color-category-villagers"), 12, color("color-paper")),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
