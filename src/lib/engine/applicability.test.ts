import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { recordValues } from "$lib/utils.js";

import { isItemApplicable, isItemApplicableForAlmanac } from "./applicability";

import type { CompletedState } from "$lib/stores/user-state.svelte.js";
import type {
  AnimalVariantId,
  CosmeticId,
  ItemId,
  VillagerId,
  VillagerRelationship,
} from "$lib/types/tracker-data.js";

// ─── Helpers ───────────────────────────────────────────────────────

function findItemWithSource(
  sourceType: string,
): undefined | { itemId: ItemId; villagerId: VillagerId } {
  for (const [itemId, item] of Object.entries(trackerData.items)) {
    for (const source of item.sources) {
      if (source.type === sourceType && "villagerId" in source) {
        return { itemId: itemId as ItemId, villagerId: source.villagerId };
      }
    }
  }
  return undefined;
}

function makeCompleted(overrides: Partial<CompletedState> = {}): CompletedState {
  const animals: Record<string, Set<AnimalVariantId>> = {};
  const animalCosmetics: Record<string, Set<CosmeticId>> = {};
  for (const id of Object.keys(trackerData.animals)) {
    animals[id] = new Set();
    animalCosmetics[id] = new Set();
  }

  return {
    almanac: new Set(),
    almanacRecipes: new Set(),
    animalCosmetics,
    animals,
    childChoice: "undeclared",
    cosmetics: new Set(),
    dates: new Set(),
    hasUpperFloor: false,
    mines: { floor: 0, spells: new Set() },
    museum: new Set(),
    petCosmetics: new Set(),
    petSkins: new Set(),
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    skillLevels: {},
    unlockedPerks: new Set(),
    villagerLevels: {},
    villagerRelationships: {},
    ...overrides,
  };
}

// ─── isItemApplicable ─────────────────────────────────────────────

describe("isItemApplicable", () => {
  it("returns true for items with no marriage-exclusive sources", () => {
    const nonMarriageItem = Object.entries(trackerData.items).find(
      ([, item]) => !item.sources.some((s) => s.type === "proposal" || s.type === "spouseGift"),
    );
    if (!nonMarriageItem) return;
    const [itemId] = nonMarriageItem;
    expect(isItemApplicable(itemId as ItemId, makeCompleted())).toBe(true);
  });

  it("returns true for already-completed items regardless of relationship", () => {
    const proposalItem = findItemWithSource("proposal");
    if (!proposalItem) return;
    const completed = makeCompleted({
      almanac: new Set([proposalItem.itemId]),
      villagerRelationships: { [proposalItem.villagerId]: "platonic" },
    });
    expect(isItemApplicable(proposalItem.itemId, completed)).toBe(true);
  });

  it("suppresses proposal items when the Villager is platonic", () => {
    const proposalItem = findItemWithSource("proposal");
    if (!proposalItem) return;
    const completed = makeCompleted({
      villagerRelationships: { [proposalItem.villagerId]: "platonic" },
    });
    expect(isItemApplicable(proposalItem.itemId, completed)).toBe(false);
  });

  it("shows proposal items when the Villager relationship is undecided", () => {
    const proposalItem = findItemWithSource("proposal");
    if (!proposalItem) return;
    expect(isItemApplicable(proposalItem.itemId, makeCompleted())).toBe(true);
  });

  it("suppresses spouse gifts when married to a different Villager", () => {
    const spouseItem = findItemWithSource("spouseGift");
    if (!spouseItem) return;
    const otherVillager = Object.entries(trackerData.villagers).find(
      ([id, villager]) => villager.dateable && id !== spouseItem.villagerId,
    );
    if (!otherVillager) return;

    const completed = makeCompleted({
      villagerRelationships: {
        [otherVillager[0]]: "married",
        [spouseItem.villagerId]: "platonic",
      } as Partial<Record<VillagerId, VillagerRelationship>>,
    });
    expect(isItemApplicable(spouseItem.itemId, completed)).toBe(false);
  });

  it("shows spouse gifts when married to the matching Villager", () => {
    const spouseItem = findItemWithSource("spouseGift");
    if (!spouseItem) return;
    const completed = makeCompleted({
      villagerRelationships: { [spouseItem.villagerId]: "married" },
    });
    expect(isItemApplicable(spouseItem.itemId, completed)).toBe(true);
  });
});

// ─── isItemApplicableForAlmanac ───────────────────────────────────

describe("isItemApplicableForAlmanac", () => {
  it("returns true when any member of the colorway group is completed", () => {
    const colorwayEntry = recordValues(trackerData.almanac)
      .flatMap(({ items }) => items)
      .find((entry) => entry.itemIds.length > 1);
    if (!colorwayEntry) return;

    const completed = makeCompleted({ almanac: new Set([colorwayEntry.itemIds[0]]) });
    expect(isItemApplicableForAlmanac(colorwayEntry.itemIds, completed)).toBe(true);
  });

  it("delegates to isItemApplicable when no member is completed", () => {
    const nonMarriageItem = Object.entries(trackerData.items).find(
      ([, item]) => !item.sources.some((s) => s.type === "proposal" || s.type === "spouseGift"),
    );
    if (!nonMarriageItem) return;
    const [itemId] = nonMarriageItem;
    expect(isItemApplicableForAlmanac([itemId as ItemId], makeCompleted())).toBe(true);
  });
});
