import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";

import {
  everythingRowArt,
  everythingSpriteKeys,
  everythingSpriteRows,
  renownRewardSprites,
} from "./everything-sprites.js";
import { NO_ART_ENTITIES } from "./no-art.js";

describe("everythingRowArt", () => {
  it("keys an entity's sprite by its own ID under its kind", () => {
    expect(everythingRowArt("cosmetic", "hair_afro")).toEqual({
      kind: "sprite",
      sprite: { id: "hair_afro", kind: "cosmetics" },
    });
    expect(everythingRowArt("animal-cosmetics", "alpaca/bowtie")).toEqual({
      kind: "sprite",
      sprite: { id: "alpaca/bowtie", kind: "animal-cosmetics" },
    });
    expect(everythingRowArt("museum-item", "apple")).toEqual({
      kind: "sprite",
      sprite: { id: "apple", kind: "items" },
    });
  });

  it("pictures a recipe with the almanac item it makes", () => {
    const rows = everythingSpriteRows().filter(({ kind }) => kind === "recipe");
    expect(rows.length).toBeGreaterThan(0);
    expect(
      new Set(rows.map(({ art }) => (art?.kind === "sprite" ? art.sprite.kind : art))),
    ).toEqual(new Set(["items"]));
  });

  it("gives listed rows the placeholder, with the reason", () => {
    const quest = everythingRowArt("quest", "anything");
    const variant = everythingRowArt("animal-variants", "alpaca/white");
    expect(quest?.kind === "none" && quest.reason).toContain("quest");
    expect(variant?.kind === "none" && variant.reason).toContain("recolors");
  });
});

describe("no-art list", () => {
  it("names only animal variants the tracker data has", () => {
    const variants = new Set(
      Object.entries(trackerData.animals).flatMap(([animalId, animal]) =>
        animal.variantTiers.flatMap((tier) => Object.keys(tier).map((id) => `${animalId}/${id}`)),
      ),
    );
    const stale = Object.keys(NO_ART_ENTITIES["animal-variants"]).filter((id) => !variants.has(id));
    expect(stale).toEqual([]);
  });
});

describe("everythingSpriteRows", () => {
  it("lists each row once, under its Everything category", () => {
    const rows = everythingSpriteRows();
    const keys = rows.map(({ id, kind }) => `${kind}:${id}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(rows.find(({ kind }) => kind === "spell")?.category).toBe("mines");
    expect(rows.find(({ kind }) => kind === "pet-skin")?.category).toBe("animals");
  });
});

describe("renownRewardSprites", () => {
  it("pictures every item & cosmetic reward", () => {
    const rewards = renownRewardSprites();
    expect(rewards).toHaveLength(
      trackerData.renown.rewards.filter(({ type }) => type !== "money").length,
    );
    expect(rewards.every(({ sprite }) => sprite !== undefined)).toBe(true);
    expect(rewards.find(({ id }) => id === "treasure_box_gold")?.sprite).toEqual({
      id: "treasure_box_gold",
      kind: "items",
    });
  });
});

describe("everythingSpriteKeys", () => {
  it("covers each kind's sprites, sorted & without duplicates", () => {
    const keys = everythingSpriteKeys();
    expect(keys).toEqual([...new Set(keys)].toSorted());
    expect(keys).toContain("cosmetics/hair_afro");
    expect(keys).toContain("mount-perks/horsepower");
    expect(keys).toContain("items/treasure_box_gold");
    expect(keys).not.toContain("animal-variants/alpaca/white");
  });
});
