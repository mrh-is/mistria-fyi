import { describe, expect, it } from "vitest";

import { findSameNameRowSets, proposeItemVariants, resolveItemVariants } from "./item-variants.js";

import type { ItemVariantSet } from "../overrides/item-variants.js";

const cobwebs = {
  descriptions: {
    cobweb_left: "A decorative white cobweb, left version.",
    cobweb_left_dark: "A decorative purple cobweb, left version.",
  },
  set: { ids: ["cobweb_left", "cobweb_left_dark"], name: "Cobweb Left" },
};

describe("findSameNameRowSets", () => {
  it("keeps only names more than one row shares, sorted", () => {
    expect(
      findSameNameRowSets([
        { id: "rug_b", name: "Rug" },
        { id: "lamp", name: "Lamp" },
        { id: "rug_a", name: "Rug" },
      ]),
    ).toEqual([{ ids: ["rug_a", "rug_b"], name: "Rug" }]);
  });
});

describe("proposeItemVariants", () => {
  it("names rows from their descriptions before their IDs", () => {
    // The ID says “dark”, but the game’s own wording says “purple”; the shared “left version”
    // isn’t part of either name.
    expect(proposeItemVariants(cobwebs.set, cobwebs.descriptions)).toEqual({
      from: "description",
      kind: "named",
      phrases: { cobweb_left: "white", cobweb_left_dark: "purple" },
      review: [],
    });
  });

  it("keeps a multi-word phrase whole & drops its article", () => {
    expect(
      proposeItemVariants(
        { ids: ["chest_aqua", "chest_light_brown"], name: "Chest" },
        { chest_aqua: "An aqua chest.", chest_light_brown: "A light brown chest." },
      ),
    ).toMatchObject({ phrases: { chest_aqua: "aqua", chest_light_brown: "light brown" } });
  });

  it("flags descriptions that differ in more than one phrase", () => {
    const proposal = proposeItemVariants(
      { ids: ["cabinet_v1", "cabinet_v2"], name: "Cabinet" },
      {
        cabinet_v1: "A walnut cabinet with green decorations.",
        cabinet_v2: "An oak cabinet with white decorations.",
      },
    );
    expect(proposal).toMatchObject({
      kind: "named",
      phrases: { cabinet_v1: "walnut cabinet with green", cabinet_v2: "oak cabinet with white" },
    });
    expect(proposal.kind === "named" && proposal.review).toHaveLength(1);
  });

  it("leaves bare version IDs with identical descriptions unnamed", () => {
    expect(
      proposeItemVariants(
        { ids: ["stone_lamp_v1", "stone_lamp_v2"], name: "Stone Lamp" },
        { stone_lamp_v1: "A stone lamp.", stone_lamp_v2: "A stone lamp." },
      ),
    ).toMatchObject({ kind: "unnamed" });
  });

  it("falls back to IDs when every description is the same", () => {
    expect(
      proposeItemVariants(
        { ids: ["chest_blue", "chest_witch_queen"], name: "Chest" },
        { chest_blue: "A chest.", chest_witch_queen: "A chest." },
      ),
    ).toMatchObject({
      from: "id",
      kind: "named",
      phrases: { chest_blue: "blue", chest_witch_queen: "witch queen" },
    });
  });

  it("leaves a set unnamed when any row names no difference", () => {
    expect(
      proposeItemVariants(
        { ids: ["altar_v1", "altar_v2"], name: "Altar" },
        { altar_v1: "A golden altar.", altar_v2: "A golden altar with pink accents." },
      ),
    ).toMatchObject({ kind: "unnamed" });
  });
});

describe("resolveItemVariants", () => {
  const reviewed: ItemVariantSet[] = [
    {
      name: "Cobweb Left",
      named: {
        cobweb_left: { description: cobwebs.descriptions.cobweb_left, variant: "white" },
        cobweb_left_dark: { description: cobwebs.descriptions.cobweb_left_dark, variant: "purple" },
      },
    },
  ];

  it("returns each reviewed row’s variant", () => {
    expect(resolveItemVariants([cobwebs.set], cobwebs.descriptions, reviewed)).toEqual(
      new Map([
        ["cobweb_left", "white"],
        ["cobweb_left_dark", "purple"],
      ]),
    );
  });

  it("returns nothing for a set reviewed as unnamed", () => {
    const unnamed: ItemVariantSet[] = [
      { name: "Cobweb Left", reason: "test", unnamed: ["cobweb_left_dark", "cobweb_left"] },
    ];
    expect(resolveItemVariants([cobwebs.set], cobwebs.descriptions, unnamed).size).toBe(0);
  });

  it("throws on an uncovered set, with a proposal", () => {
    expect(() => resolveItemVariants([cobwebs.set], cobwebs.descriptions, [])).toThrow(
      /“Cobweb Left”.*aren’t in the reviewed table; proposal: .*"cobweb_left_dark":"purple"/,
    );
  });

  it("throws on a reviewed set that no longer occurs", () => {
    expect(() => resolveItemVariants([], {}, reviewed)).toThrow(
      /“Cobweb Left” \(cobweb_left, cobweb_left_dark\) no longer matches/,
    );
  });

  it("throws when a set gains a row", () => {
    const grown = { ...cobwebs.set, ids: [...cobwebs.set.ids, "cobweb_left_gold"] };
    expect(() => resolveItemVariants([grown], cobwebs.descriptions, reviewed)).toThrow(
      /aren’t in the reviewed table[\s\S]*no longer matches/,
    );
  });

  it("throws when a reviewed description changes", () => {
    const reworded = { ...cobwebs.descriptions, cobweb_left_dark: "A dark cobweb, left version." };
    expect(() => resolveItemVariants([cobwebs.set], reworded, reviewed)).toThrow(
      /description for “cobweb_left_dark” changed/,
    );
  });

  it("throws when variants don’t tell the rows apart", () => {
    const repeated: ItemVariantSet[] = [
      {
        name: "Cobweb Left",
        named: {
          cobweb_left: { description: cobwebs.descriptions.cobweb_left, variant: "white" },
          cobweb_left_dark: {
            description: cobwebs.descriptions.cobweb_left_dark,
            variant: "white",
          },
        },
      },
    ];
    expect(() => resolveItemVariants([cobwebs.set], cobwebs.descriptions, repeated)).toThrow(
      /repeats variant “white”/,
    );
  });
});
