import { describe, expect, it } from "vitest";

import {
  buildAnimalNames,
  buildBundleNames,
  buildLocationNames,
  buildMonsterNames,
  buildUnnamedSourceNames,
  buildWaterNames,
  SCROLL_BUNDLE_ITEM_IDS,
} from "./source-names.js";

describe("buildLocationNames", () => {
  it("names every location in English", () => {
    const names = buildLocationNames("en");

    expect(names.beach).toBe("Beach");
    expect(Object.values(names).every((name) => name !== undefined && name !== "")).toBe(true);
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

    expect(names.mushroom).toBe(names.mushroom_blue?.replace(" (blue)", ""));
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
