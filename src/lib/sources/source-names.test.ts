import { beforeAll, describe, expect, it } from "vitest";

import { loadNames } from "#lib/data/names.js";
import { LOCALE_CODES } from "#lib/types/locale.js";

import {
  buildAnimalNames,
  buildLocationNames,
  buildMonsterNames,
  buildWaterNames,
} from "./source-names.js";

beforeAll(async () => {
  await Promise.all(
    LOCALE_CODES.map((locale) =>
      loadNames(locale, ["items", "locations", "monsters", "pets/skins"]),
    ),
  );
});

describe("game-data tables", () => {
  it("name every monster through its pet skin in every locale", () => {
    for (const locale of LOCALE_CODES) {
      const monsters = buildMonsterNames(locale);

      expect(Object.keys(monsters).length).toBeGreaterThan(0);
      for (const name of Object.values(monsters)) expect(name).not.toBe("");
    }
  });
});

describe("buildLocationNames", () => {
  it("names every location in English", () => {
    const names = buildLocationNames("en");

    expect(names.beach).toBe("the Beach");
    expect(names.haydens_farm).toBe("Sweetwater Farm");
    expect(names.farm).toBe("your farm");
    expect(Object.values(names).every((name) => name !== "")).toBe(true);
  });

  it("lowercases English articles, since names only appear mid-sentence", () => {
    for (const name of Object.values(buildLocationNames("en"))) expect(name).not.toMatch(/^The /);
  });

  it("names the Bell Tower's unnamed upper floor after the building", () => {
    const names = buildLocationNames("fr");

    expect(names.bell_tower_f2).toBe(names.bell_tower_f1);
    expect(names.bell_tower_f2).not.toBe("");
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
  it("names monsters after their pet variants in English", () => {
    const names = buildMonsterNames("en");

    expect(names.mushroom).toBe("Mushroom");
    expect(names.mushroom_blue).toBe("Blue Mushroom");
    expect(names.cat).toBe("Lava Cat");
    expect(names.cat_void).toBe("Void Cat");
  });

  it("composes family & variant for monsters with no pet variant", () => {
    const names = buildMonsterNames("en");

    expect(names.mistrilclod).toBe("Oreclod (mistril)");
    expect(names.rockclod_purple).toBe("Rockclod (purple)");
  });

  it("composes family & variant outside English", () => {
    const names = buildMonsterNames("fr");

    expect(names.cat).toBe("Magmatou");
    expect(names.cat_void).toBe("Void Cat");
    expect(names.sapling_blue).toBe(`${names.sapling} (bleu)`);
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
