import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { LOCALE_CODES } from "#lib/types/locale.js";
import { buildBaseSegmentLookups } from "#lib/utils/segment-lookups.js";
import { buildSourceSegments, type SourceSegment } from "#lib/utils/source-segments.js";

import type { AvailabilityCondition, Source } from "#lib/types/acquisition.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

interface SourcedEntity {
  entity: { sources: Source[]; visibility?: VisibilityCondition };
  path: string;
}

interface UnsupportedPredicateDiagnostic {
  entityId: string;
  entityKind: string;
  predicate: string;
  sourceIndex: number;
}

const SOURCE_TYPES: Record<Source["type"], true> = {
  animal_product: true,
  artifact_dig: true,
  artifact_replicator: true,
  bait_fish: true,
  beach_cave_chest: true,
  breed: true,
  bug_catch: true,
  chicken_statue: true,
  crop: true,
  date: true,
  date_inspiration: true,
  default: true,
  dive: true,
  donate_item: true,
  engagement: true,
  equipment: true,
  festival: true,
  festival_activity: true,
  fish: true,
  fish_trap: true,
  forage: true,
  lost_and_found: true,
  mine: true,
  mine_fish: true,
  mines_chest: true,
  mines_dig_site: true,
  monster: true,
  monster_feed: true,
  museum_donation: true,
  perk: true,
  perk_drop: true,
  proposal: true,
  quest: true,
  reach_day: true,
  recipe: true,
  renown: true,
  ritual_chamber: true,
  scroll_bundle: true,
  ship_item: true,
  spouseGift: true,
  station: true,
  store: true,
  treasure_chest: true,
  tree: true,
  upgrade: true,
  wedding: true,
  wishing_well: true,
};

function collectGamePredicates(
  condition: AvailabilityCondition | undefined,
): { predicate: string }[] {
  if (!condition) return [];
  switch (condition.type) {
    case "all":
    case "any":
      return condition.conditions.flatMap(collectGamePredicates);
    case "always":
    case "hasUpperFloor":
    case "heartLevel":
    case "isDating":
    case "minesLevel":
    case "perkUnlocked":
    case "quest":
    case "reachedSeason":
    case "season":
    case "skillLevel":
    case "time":
    case "weather":
      return [];
    case "gamePredicate":
      return [{ predicate: condition.predicate }];
    case "not":
      return collectGamePredicates(condition.condition);
  }
}

function collectSourcedEntities(value: unknown, path = "trackerData"): SourcedEntity[] {
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      collectSourcedEntities(child, `${path}[${String(index)}]`),
    );
  }
  if (!isRecord(value)) return [];

  if (Array.isArray(value.sources) && value.sources.length > 0) {
    expect(value.sources.every(isSource), `${path}.sources`).toBe(true);
    return [
      {
        entity: value as { sources: Source[]; visibility?: VisibilityCondition },
        path,
      },
    ];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectSourcedEntities(child, `${path}.${key}`),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSource(value: unknown): value is Source {
  return (
    isRecord(value) && typeof value.type === "string" && Object.hasOwn(SOURCE_TYPES, value.type)
  );
}

function pathIdentity(path: string): { entityId: string; entityKind: string } {
  const parts = path.split(".");
  return {
    entityId: parts.at(-1) ?? path,
    entityKind: parts.slice(1, -1).join("."),
  };
}

function walkSegments(segments: SourceSegment[], context: string): void {
  expect(segments.length, context).toBeGreaterThan(0);
  for (const segment of segments) {
    if (typeof segment === "string") {
      expect(segment.length, context).toBeGreaterThan(0);
      continue;
    }
    if ("redacted" in segment && segment.redacted === true) continue;
    walkSegments(segment.revealed, context);
    if (segment.redacted) walkSegments(segment.redacted, context);
  }
}

describe("generated source rendering contract", () => {
  const sourcedEntities = collectSourcedEntities(trackerData);
  const paths = sourcedEntities.map(({ path }) => path);
  const baseLookups = buildBaseSegmentLookups(new Set(), "en");

  it.each([
    "trackerData.items.",
    "trackerData.recipes.",
    "trackerData.cosmetics.",
    "trackerData.mines.spells.",
    "trackerData.pets.cosmetics.",
    "trackerData.pets.skins.",
  ])("discovers source-bearing entities under %s", (prefix) => {
    expect(
      paths.some((path) => path.startsWith(prefix)),
      paths.join("\n"),
    ).toBe(true);
  });

  it("discovers animal cosmetics recursively", () => {
    expect(
      paths.some((path) => path.startsWith("trackerData.animals.") && path.includes(".cosmetics.")),
      paths.join("\n"),
    ).toBe(true);
  });

  it("renders every generated source and resolves every formatter reference", () => {
    for (const { entity, path } of sourcedEntities) {
      entity.sources.forEach((source, index) => {
        const context = `${path} source[${String(index)}] ${JSON.stringify(source)}`;

        if (
          source.type === "mine" ||
          source.type === "mines_chest" ||
          source.type === "mines_dig_site"
        ) {
          expect(
            baseLookups.biomes.some(({ id }) => id === source.biomeId),
            context,
          ).toBe(true);
        }
        if ("perkId" in source && source.perkId !== undefined) {
          expect(baseLookups.perks[source.perkId], context).toBeDefined();
        }
        if (source.type === "quest") {
          expect(source.questType ?? baseLookups.questTypes[source.questId], context).toBeDefined();
        }
        if ("storeId" in source && source.storeId !== undefined) {
          expect(baseLookups.stores[source.storeId], context).toBeDefined();
        }

        expect(() => {
          const segments = buildSourceSegments(source, {
            ...baseLookups,
            entityVisibility: entity.visibility,
          });
          walkSegments(segments, context);
        }, context).not.toThrow();
      });
    }
  });

  it.each(LOCALE_CODES.filter((locale) => locale !== "en"))(
    "renders every generated source in %s",
    (locale) => {
      const lookups = buildBaseSegmentLookups(new Set(), locale);
      for (const { entity, path } of sourcedEntities) {
        entity.sources.forEach((source, index) => {
          const context = `${locale} ${path} source[${String(index)}] ${JSON.stringify(source)}`;
          expect(() => {
            walkSegments(
              buildSourceSegments(source, { ...lookups, entityVisibility: entity.visibility }),
              context,
            );
          }, context).not.toThrow();
        });
      }
    },
  );

  it.each(LOCALE_CODES)("resolves every source name reference in %s", (locale) => {
    const lookups = buildBaseSegmentLookups(new Set(), locale);
    const missing = new Set<string>();
    const check = (table: Partial<Record<string, string>>, kind: string, id: string) => {
      if (table[id] === undefined) missing.add(`${kind}:${id}`);
    };

    for (const { entity } of sourcedEntities) {
      for (const source of entity.sources) {
        if (source.type === "animal_product") {
          check(lookups.animalNames, "animal", source.animalId);
        }
        if (
          source.type === "artifact_dig" ||
          source.type === "bug_catch" ||
          source.type === "forage"
        ) {
          for (const id of source.locationIds ?? []) check(lookups.locationNames, "location", id);
        }
        if (source.type === "dive" || source.type === "fish") {
          for (const id of source.waterTypes ?? []) check(lookups.waterNames, "water", id);
        }
        if (
          (source.type === "monster" || source.type === "monster_feed") &&
          source.monsterId !== "any"
        ) {
          check(lookups.monsterNames, "monster", source.monsterId);
        }
        if (source.type === "museum_donation") {
          check(lookups.museumWingNames, "wing", source.wingId);
        }
        if (source.type === "scroll_bundle") {
          check(lookups.bundleNames, "bundle", source.bundleName);
        }
        if (source.type === "station") {
          check(lookups.stationNames, "station", source.stationId);
        }
      }
    }

    expect([...missing].sort()).toEqual([]);
  });

  it("has no unsupported predicate diagnostics", () => {
    const diagnostics: UnsupportedPredicateDiagnostic[] = sourcedEntities
      .flatMap(({ entity, path }) => {
        const { entityId, entityKind } = pathIdentity(path);
        return entity.sources.flatMap((source, sourceIndex) =>
          collectGamePredicates("availability" in source ? source.availability : undefined).map(
            ({ predicate }) => ({ entityId, entityKind, predicate, sourceIndex }),
          ),
        );
      })
      .sort(
        (left, right) =>
          left.predicate.localeCompare(right.predicate) ||
          left.entityKind.localeCompare(right.entityKind) ||
          left.entityId.localeCompare(right.entityId) ||
          left.sourceIndex - right.sourceIndex,
      );
    const details = JSON.stringify(diagnostics, null, 2);

    expect(diagnostics, details).toHaveLength(0);
  });
});
