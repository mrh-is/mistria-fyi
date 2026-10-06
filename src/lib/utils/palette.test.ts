import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CONFETTI_COLOR_COUNT,
  RELATIONSHIP_LEVEL_COLOR_COUNT,
  relationshipLevelColor,
  TOWN_RANK_COLOR_COUNT,
  townRankColor,
} from "#lib/utils/palette.js";

const appCss = readFileSync(join(import.meta.dirname, "../../app.css"), "utf8");

function value(name: string): number {
  return Number(new RegExp(`--z-${name}:\\s*(\\d+)`, "u").exec(appCss)?.[1]);
}

function defined(name: string): boolean {
  return new RegExp(`^\\s*--${name}:`, "mu").test(appCss);
}

describe("palette tokens", () => {
  it("defines every level, rank, & confetti token in app.css", () => {
    for (let n = 1; n <= RELATIONSHIP_LEVEL_COLOR_COUNT; n += 1) {
      expect(defined(`color-relationship-level-${n}`)).toBe(true);
    }
    for (let n = 1; n <= TOWN_RANK_COLOR_COUNT; n += 1) {
      expect(defined(`color-town-rank-${n}`)).toBe(true);
    }
    for (let n = 1; n <= CONFETTI_COLOR_COUNT; n += 1) {
      expect(defined(`color-confetti-${n}`)).toBe(true);
    }
  });

  it("defines no token beyond the counts", () => {
    expect(
      defined(`color-relationship-level-${(RELATIONSHIP_LEVEL_COLOR_COUNT + 1).toString()}`),
    ).toBe(false);
    expect(defined(`color-town-rank-${(TOWN_RANK_COLOR_COUNT + 1).toString()}`)).toBe(false);
    expect(defined(`color-confetti-${(CONFETTI_COLOR_COUNT + 1).toString()}`)).toBe(false);
  });

  it("maps zero-based indexes to one-based tokens", () => {
    expect(relationshipLevelColor(0)).toBe("var(--color-relationship-level-1)");
    expect(townRankColor(0)).toBe("var(--color-town-rank-1)");
    expect(townRankColor(TOWN_RANK_COLOR_COUNT - 1)).toBe(
      `var(--color-town-rank-${TOWN_RANK_COLOR_COUNT.toString()})`,
    );
  });

  it("clamps a rank past the ladder to the last token", () => {
    expect(townRankColor(TOWN_RANK_COLOR_COUNT + 5)).toBe(
      `var(--color-town-rank-${TOWN_RANK_COLOR_COUNT.toString()})`,
    );
  });
});

describe("z-index tokens", () => {
  it("orders chrome, panels, pickers, & dialogs", () => {
    const order = [
      "section-header",
      "page-header",
      "home-header",
      "toolbar",
      "panel",
      "picker",
      "dialog",
    ];
    const values = order.map((name) => value(name));
    expect(values.every((number) => Number.isInteger(number))).toBe(true);
    expect(values).toEqual(values.toSorted((a, b) => a - b));
  });
});
