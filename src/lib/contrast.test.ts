import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");

type Rgb = [number, number, number];

function contrast(first: Rgb, second: Rgb): number {
  const [dark, light] = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (light + 0.05) / (dark + 0.05);
}

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
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
  const darkOverrides = parseBlock("\\.dark");
  const darkTokens = { ...lightTokens, ...darkOverrides };

  for (const [name, tokens] of [
    ["light", lightTokens],
    ["dark", darkTokens],
  ] as const) {
    it(`${name} theme meets intended text and non-text combinations`, () => {
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
  }
});
