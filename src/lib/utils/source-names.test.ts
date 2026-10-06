import { beforeAll, describe, expect, it } from "vitest";

import { getNameTable, loadNames } from "#lib/data/names.js";
import { LOCALE_CODES } from "#lib/types/locale.js";

import {
  buildAnimalNames,
  buildBundleNames,
  buildLocationNames,
  buildMonsterNames,
  buildUnnamedSourceNames,
  buildWaterNames,
  SCROLL_BUNDLE_ITEM_IDS,
  UNNAMED_SOURCE_IDS,
} from "./source-names.js";

beforeAll(async () => {
  await Promise.all(
    LOCALE_CODES.map((locale) =>
      loadNames(locale, ["items", "pets/skins", "quests", "treasure-chest-tiers"]),
    ),
  );
});

describe("game-data tables", () => {
  it("name every monster (through its pet skin) & bundle item in every locale", () => {
    for (const locale of LOCALE_CODES) {
      const items = getNameTable("items", locale);
      const monsters = buildMonsterNames(locale);

      expect(Object.keys(monsters).length).toBeGreaterThan(0);
      for (const name of Object.values(monsters)) expect(name).not.toBe("");
      for (const id of Object.values(SCROLL_BUNDLE_ITEM_IDS)) expect(items).toHaveProperty(id);
    }
  });

  it("keeps unnamed quests & chest tiers out of the game's name tables", () => {
    const quests = getNameTable("quests", "en");
    const tiers = getNameTable("treasure-chest-tiers", "en");

    for (const id of UNNAMED_SOURCE_IDS.quests) expect(quests).not.toHaveProperty(id);
    for (const id of UNNAMED_SOURCE_IDS.treasureChestTiers) expect(tiers).not.toHaveProperty(id);
  });
});

describe("buildLocationNames", () => {
  it("names every location in English", () => {
    const names = buildLocationNames("en");

    expect(names.beach).toBe("Beach");
    expect(Object.values(names).every((name) => name !== "")).toBe(true);
  });

  it("localizes names per locale", () => {
    expect(buildLocationNames("ja").beach).not.toBe(buildLocationNames("en").beach);
  });
});

describe("buildWaterNames", () => {
  it("names each water body", () => {
    expect(Object.keys(buildWaterNames("en")).toSorted()).toEqual(["ocean", "pond", "river"]);
    expect(buildWaterNames("en").river).toBe("River");
  });
});

describe("buildMonsterNames", () => {
  it("names a base monster by its family", () => {
    const names = buildMonsterNames("en");

    expect(names.mushroom).toBe(names.mushroom_blue.replace(" (blue)", ""));
  });

  it("composes variant names around the family name", () => {
    const names = buildMonsterNames("en");

    expect(names.mushroom_blue).toBe(`${names.mushroom} (blue)`);
    expect(names.copperclod).toMatch(/\(copper\)$/);
  });

  it("shares one family name across variants of different ids", () => {
    const names = buildMonsterNames("en");

    expect(names.cat).toBe(names.void_cat);
    expect(names.cat).toBe(names.cat_void);
  });
});

describe("buildBundleNames", () => {
  it("keys every scroll bundle by its English name", () => {
    expect(Object.keys(buildBundleNames("en")).toSorted()).toEqual(
      Object.keys(SCROLL_BUNDLE_ITEM_IDS).toSorted(),
    );
  });

  it("names bundles through the item table", () => {
    expect(buildBundleNames("en")["Chess Piece Scroll Bundle"]).toBe("Chess Piece Scroll Bundle");
  });
});

describe("buildAnimalNames", () => {
  it("keys names by animal id with the /core suffix removed", () => {
    const names = buildAnimalNames("en");
    const keys = Object.keys(names);

    expect(keys).toContain("alpaca");
    expect(keys.every((key) => !key.includes("/"))).toBe(true);
    expect(names.alpaca).toBe("Alpaca");
  });
});

describe("buildUnnamedSourceNames", () => {
  it("title-cases snake_case ids", () => {
    expect(buildUnnamedSourceNames(["break_fire_seal", "abyss"])).toEqual({
      abyss: "Abyss",
      break_fire_seal: "Break Fire Seal",
    });
  });

  it("returns an empty record for no ids", () => {
    expect(buildUnnamedSourceNames([])).toEqual({});
  });
});
