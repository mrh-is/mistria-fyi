import { describe, expect, it } from "vitest";

import css from "../app.css?raw";

type Rgb = [number, number, number];

function contrast(first: Rgb, second: Rgb): number {
  const [dark, light] = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (light + 0.05) / (dark + 0.05);
}

function luminance(rgb: Rgb): number {
  const linear = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  ) as Rgb;
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function oklchToRgb([lightness, chroma, hue]: [number, number, number]): Rgb {
  const angle = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);
  const l = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3);
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  return channels.map((channel) =>
    Math.max(
      0,
      Math.min(1, channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055),
    ),
  ) as Rgb;
}

function parseTheme(selector: string): Record<string, [number, number, number]> {
  const block = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1];
  if (!block) throw new Error(`Theme not found: ${selector}`);

  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)].map(
      ([, name, lightness, chroma, hue]) => [
        name,
        [Number(lightness), Number(chroma), Number(hue)],
      ],
    ),
  );
}

describe("theme contrast tokens", () => {
  for (const [name, theme] of [
    ["light", parseTheme(":root")],
    ["dark", parseTheme("\\.dark")],
  ] as const) {
    it(`${name} theme meets intended text and non-text combinations`, () => {
      const color = (token: string) => {
        const value = theme[token];
        if (!value) throw new Error(`Token not found in ${name} theme: ${token}`);
        return oklchToRgb(value);
      };
      const textSurfaces = ["background", "card", "popover", "muted", "accent"];

      expect(contrast(color("primary-foreground"), color("primary"))).toBeGreaterThanOrEqual(4.5);
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
