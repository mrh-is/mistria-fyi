import { describe, expect, it, vi } from "vitest";

import { makeFiddle } from "../test-helpers";
import { extractVillagerIconSprites, extractVillagers } from "./villagers";

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

  it("includes a villager missing icon_sprite in tracker data but not in icon sprite index", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { iconSpritesByVillagerId, villagers } = extractVillagers(
      makeFiddle({
        npcs: {
          adeline: { birthday: { day: 3, season: "spring" }, name: "Adeline" },
        },
      }),
      "unused-assets-dir",
    );

    expect(iconSpritesByVillagerId).toStrictEqual({});
    expect(villagers["adeline" as VillagerId]).toStrictEqual({
      birthday: { day: 3, season: "spring" },
    });
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

describe("extractVillagerIconSprites", () => {
  it("builds the icon-sprite index without calling localizeField", async () => {
    const { localizeField } = await import("../localize");

    const iconSpritesByVillagerId = extractVillagerIconSprites(
      makeFiddle({
        npcs: {
          adeline: {
            birthday: { day: 3, season: "spring" },
            icon_sprite: "spr_ui_generic_icon_npc_adeline",
            name: "Adeline",
          },
          default: { birthday: { day: 1, season: "spring" }, name: "Default" },
        },
      }),
    );

    expect(iconSpritesByVillagerId).toStrictEqual({ adeline: "spr_ui_generic_icon_npc_adeline" });
    expect(localizeField).not.toHaveBeenCalled();
  });

  it("throws when a villager is missing icon_sprite", () => {
    expect(() =>
      extractVillagerIconSprites(
        makeFiddle({
          npcs: {
            adeline: { birthday: { day: 3, season: "spring" }, name: "Adeline" },
          },
        }),
      ),
    ).toThrow('Missing icon_sprite for villager "adeline"');
  });

  it("agrees with extractVillagers on which IDs count as real villagers", () => {
    const fiddle = makeFiddle({
      npcs: {
        adeline: {
          birthday: { day: 3, season: "spring" },
          icon_sprite: "spr_ui_generic_icon_npc_adeline",
          name: "Adeline",
        },
        default: { birthday: { day: 1, season: "spring" }, name: "Default" },
        nameless: { birthday: { day: 1, season: "spring" }, icon_sprite: "spr_x" },
      },
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const iconSpritesByVillagerId = extractVillagerIconSprites(fiddle);
    const { iconSpritesByVillagerId: fromFullExtraction } = extractVillagers(
      fiddle,
      "unused-assets-dir",
    );

    expect(iconSpritesByVillagerId).toStrictEqual(fromFullExtraction);
  });
});
