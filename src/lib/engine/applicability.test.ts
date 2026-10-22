import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";
import { recordValues } from "#lib/utils/record.js";

import { isAlmanacEntryObtainable, isItemObtainable } from "./applicability.js";

import type { ItemId, VillagerId, VillagerRelationship } from "#lib/types/tracker-data.js";

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

// ─── isItemObtainable ─────────────────────────────────────────────

describe("isItemObtainable", () => {
  it.each(["proposed", "married"] as const)(
    "suppresses another villager's proposal with a %s partner even when dating continues",
    (relationship) => {
      const proposalItem = findItemWithSource("proposal");
      if (!proposalItem) throw new Error("Missing proposal source");
      const other = Object.entries(trackerData.villagers).find(
        ([id, villager]) => villager.dateable && id !== proposalItem.villagerId,
      );
      if (!other) throw new Error("Missing other partner");
      const completed = makeCompletedState({
        breakUpsDisabled: true,
        villagerRelationships: { [other[0]]: relationship, [proposalItem.villagerId]: "romantic" },
      });
      expect(isItemObtainable(proposalItem.itemId, completed)).toBe(false);
    },
  );

  it("returns true for items with no marriage-exclusive sources", () => {
    const nonMarriageItem = Object.entries(trackerData.items).find(
      ([, item]) => !item.sources.some((s) => s.type === "proposal" || s.type === "spouseGift"),
    );
    if (!nonMarriageItem) return;
    const [itemId] = nonMarriageItem;
    expect(isItemObtainable(itemId as ItemId, makeCompletedState())).toBe(true);
  });

  it("returns true for already-completed items regardless of relationship", () => {
    const proposalItem = findItemWithSource("proposal");
    if (!proposalItem) return;
    const completed = makeCompletedState({
      almanac: new Set([proposalItem.itemId]),
      villagerRelationships: { [proposalItem.villagerId]: "platonic" },
    });
    expect(isItemObtainable(proposalItem.itemId, completed)).toBe(true);
  });

  it("suppresses proposal items when the Villager is platonic", () => {
    const proposalItem = findItemWithSource("proposal");
    if (!proposalItem) return;
    const completed = makeCompletedState({
      villagerRelationships: { [proposalItem.villagerId]: "platonic" },
    });
    expect(isItemObtainable(proposalItem.itemId, completed)).toBe(false);
  });

  it("shows proposal items when the Villager relationship is undecided", () => {
    const proposalItem = findItemWithSource("proposal");
    if (!proposalItem) return;
    expect(isItemObtainable(proposalItem.itemId, makeCompletedState())).toBe(true);
  });

  it("suppresses spouse gifts when married to a different Villager", () => {
    const spouseItem = findItemWithSource("spouseGift");
    if (!spouseItem) return;
    const otherVillager = Object.entries(trackerData.villagers).find(
      ([id, villager]) => villager.dateable && id !== spouseItem.villagerId,
    );
    if (!otherVillager) return;

    const completed = makeCompletedState({
      villagerRelationships: {
        [otherVillager[0]]: "married",
        [spouseItem.villagerId]: "platonic",
      } as Partial<Record<VillagerId, VillagerRelationship>>,
    });
    expect(isItemObtainable(spouseItem.itemId, completed)).toBe(false);
  });

  it("shows spouse gifts when married to the matching Villager", () => {
    const spouseItem = findItemWithSource("spouseGift");
    if (!spouseItem) return;
    const completed = makeCompletedState({
      villagerRelationships: { [spouseItem.villagerId]: "married" },
    });
    expect(isItemObtainable(spouseItem.itemId, completed)).toBe(true);
  });
});

// ─── isAlmanacEntryObtainable ───────────────────────────────────

describe("isAlmanacEntryObtainable", () => {
  it("returns true when any member of the colorway group is completed", () => {
    const colorwayEntry = recordValues(trackerData.almanac)
      .flatMap(({ items }) => items)
      .find((entry) => entry.itemIds.length > 1);
    if (!colorwayEntry) return;

    const completed = makeCompletedState({ almanac: new Set([colorwayEntry.itemIds[0]]) });
    expect(isAlmanacEntryObtainable(colorwayEntry.itemIds, completed)).toBe(true);
  });

  it("delegates to isItemObtainable when no member is completed", () => {
    const nonMarriageItem = Object.entries(trackerData.items).find(
      ([, item]) => !item.sources.some((s) => s.type === "proposal" || s.type === "spouseGift"),
    );
    if (!nonMarriageItem) return;
    const [itemId] = nonMarriageItem;
    expect(isAlmanacEntryObtainable([itemId as ItemId], makeCompletedState())).toBe(true);
  });
});
