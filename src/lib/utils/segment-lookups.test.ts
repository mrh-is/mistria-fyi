import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";

import { buildBaseSegmentLookups } from "./segment-lookups.js";

import type { StoreId } from "$lib/types/tracker-data.js";

describe("buildBaseSegmentLookups", () => {
  it("flattens every generated perk under its perk ID", () => {
    const lookups = buildBaseSegmentLookups(new Set(), "en");
    const expected = Object.entries(trackerData.skills).flatMap(([skillId, skill]) =>
      skill.perkTiers.flatMap((tier, index) =>
        Object.entries(tier).map(
          ([perkId, perk]) => [perkId, { name: perk.name, skillId, tier: index + 1 }] as const,
        ),
      ),
    );

    expect(lookups.perks).toEqual(Object.fromEntries(expected));
  });

  it("reuses the static lookup tables across calls while keeping redacted stores contextual", () => {
    const firstRedactedStoreIds = new Set<StoreId>();
    const secondRedactedStoreIds = new Set<StoreId>(["bathhouse" as StoreId]);

    const first = buildBaseSegmentLookups(firstRedactedStoreIds, "en");
    const second = buildBaseSegmentLookups(secondRedactedStoreIds, "en");

    expect(first.itemNames).toBe(second.itemNames);
    expect(first.perks).toBe(second.perks);
    expect(first.questNames).toBe(second.questNames);
    expect(first.redactedStoreIds).toBe(firstRedactedStoreIds);
    expect(second.redactedStoreIds).toBe(secondRedactedStoreIds);
  });
});
