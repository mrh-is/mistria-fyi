import { beforeAll, describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { getName, loadNames, NAME_CHUNKS } from "#lib/data/names.js";
import { LOCALE_CODES } from "#lib/types/locale.js";

import { buildBaseSegmentLookups } from "./segment-lookups.js";
import { UNNAMED_SOURCE_IDS } from "./source-names.js";
import { buildSourceSegments } from "./source-segments.js";

import type { Source } from "#lib/types/acquisition.js";
import type { StoreId } from "#lib/types/tracker-data.js";

beforeAll(async () => {
  await Promise.all(LOCALE_CODES.map((locale) => loadNames(locale, NAME_CHUNKS)));
});

/** Every `sources` entry anywhere in the generated tracker data. */
function collectSources(value: unknown, found: Source[] = []): Source[] {
  if (Array.isArray(value)) {
    for (const entry of value) collectSources(entry, found);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "sources" && Array.isArray(child)) found.push(...(child as Source[]));
      collectSources(child, found);
    }
  }
  return found;
}

describe("buildBaseSegmentLookups", () => {
  it("flattens every generated perk under its perk ID", () => {
    const lookups = buildBaseSegmentLookups(new Set(), "en");
    const expected = Object.entries(trackerData.skills).flatMap(([skillId, skill]) =>
      skill.perkTiers.flatMap((tier, index) =>
        Object.keys(tier).map(
          (perkId) =>
            [
              perkId,
              { name: getName("perks", perkId as never, "en"), skillId, tier: index + 1 },
            ] as const,
        ),
      ),
    );

    expect(lookups.perks).toEqual(Object.fromEntries(expected));
  });

  it("reuses the static lookup tables across calls while keeping spoilered stores contextual", () => {
    const firstSpoileredStoreIds = new Set<StoreId>();
    const secondSpoileredStoreIds = new Set<StoreId>(["bathhouse" as StoreId]);

    const first = buildBaseSegmentLookups(firstSpoileredStoreIds, "en");
    const second = buildBaseSegmentLookups(secondSpoileredStoreIds, "en");

    expect(first.itemNames).toBe(second.itemNames);
    expect(first.perks).toBe(second.perks);
    expect(first.questNames).toBe(second.questNames);
    expect(first.spoileredStoreIds).toBe(firstSpoileredStoreIds);
    expect(second.spoileredStoreIds).toBe(secondSpoileredStoreIds);
  });

  // Name lookups throw on a missing entry rather than falling back to English, so a generated
  // source that references an ID with no name (e.g. a new location with no interim translation)
  // must fail here, not at render time.
  it.each(LOCALE_CODES)("names every ID the generated sources reference in %s", (locale) => {
    const sources = collectSources(trackerData);
    expect(sources.length).toBeGreaterThan(0);

    const lookups = buildBaseSegmentLookups(new Set(), locale);
    for (const source of sources) {
      expect(() => buildSourceSegments(source, lookups), JSON.stringify(source)).not.toThrow();
    }
  });

  // Once #471 (or a pipeline change) names one of these, it must leave the allowlist.
  it("allowlists only IDs that are still referenced & still unnamed", () => {
    const sources = collectSources(trackerData);
    const questIds = new Set(sources.flatMap((s) => (s.type === "quest" ? [s.questId] : [])));
    const tiers = new Set(sources.flatMap((s) => (s.type === "treasure_chest" ? [s.tier] : [])));
    const trackedQuestIds = new Set(
      Object.values(trackerData.quests).flatMap((quests) => Object.keys(quests)),
    );

    for (const id of UNNAMED_SOURCE_IDS.quests) {
      expect(questIds.has(id), id).toBe(true);
      expect(trackedQuestIds.has(id), id).toBe(false);
    }
    for (const tier of UNNAMED_SOURCE_IDS.treasureChestTiers) {
      expect(tiers.has(tier), tier).toBe(true);
      expect(tier in trackerData.treasureChestTiers, tier).toBe(false);
    }
  });
});
