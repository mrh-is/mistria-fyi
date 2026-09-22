import { describe, expect, it, vi } from "vitest";

import { makeFiddle } from "../test-helpers";
import { extractVillagers } from "./villagers";

import type { VillagerId } from "$lib/types/tracker-data.js";

vi.mock("../localize", () => ({
  localizeField: vi.fn((_assetsDir: string, input: { englishValue: string; id: string }) => ({
    fallbackLocales: [],
    values: {
      en: input.englishValue,
      es: input.englishValue,
      fr: input.englishValue,
      ja: input.englishValue,
      ko: input.englishValue,
      ru: input.englishValue,
      "zh-Hans": input.englishValue,
      "zh-Hant": input.englishValue,
    },
  })),
}));

describe("extractVillagers", () => {
  it("captures each villager's icon_sprite without emitting it into the structural record", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { iconSpritesByVillagerId, villagers } = extractVillagers(
      makeFiddle({
        npcs: {
          adeline: {
            birthday: { day: 3, season: "spring" },
            icon_sprite: "spr_ui_generic_icon_npc_adeline",
            name: "Adeline",
          },
        },
      }),
      "unused-assets-dir",
    );

    expect(iconSpritesByVillagerId).toStrictEqual({ adeline: "spr_ui_generic_icon_npc_adeline" });
    expect(villagers["adeline" as VillagerId]).toStrictEqual({
      birthday: { day: 3, season: "spring" },
    });
  });

  it("throws when a villager is missing icon_sprite", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(() =>
      extractVillagers(
        makeFiddle({
          npcs: {
            adeline: { birthday: { day: 3, season: "spring" }, name: "Adeline" },
          },
        }),
        "unused-assets-dir",
      ),
    ).toThrow('Missing icon_sprite for villager "adeline"');
  });

  it("skips the default template entry without requiring icon_sprite", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { iconSpritesByVillagerId, villagers } = extractVillagers(
      makeFiddle({
        npcs: {
          default: { birthday: { day: 1, season: "spring" }, name: "Default" },
        },
      }),
      "unused-assets-dir",
    );

    expect(iconSpritesByVillagerId).toStrictEqual({});
    expect(villagers).toStrictEqual({});
  });
});
