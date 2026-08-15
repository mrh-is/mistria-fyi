import { simplifyAvailabilityCondition } from "$lib/engine/availability-condition.js";

import { parseRequirements } from "../../requirements.js";
import { projectRequirementExpressionToAvailability } from "../availability.js";

import type { AvailabilityCondition, Source } from "$lib/types/acquisition.js";
import type { ItemId, PerkId, Season, StoreId } from "$lib/types/tracker-data.js";

import type { SourceFieldLocation } from "../../data-shapes.js";
import type { ParsedGameData } from "../../parse-fiddle.js";
import type { RequirementContext } from "../../requirements.js";
import type { ItemSourceAccumulator } from "../source-accumulator.js";

const UPGRADE_PREDICATES = new Set([
  "repaired_carpenters_shop",
  "repaired_general_store",
  "repaired_inn",
]);

export function collectStoreSources(
  fiddle: ParsedGameData,
  requirementContext: RequirementContext,
  accumulator: ItemSourceAccumulator,
): void {
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (!stores) return;

  for (const [storeId, store] of Object.entries(stores)) {
    if (storeId === "default" || typeof store !== "object" || store === null) continue;
    const categories = Array.isArray(store.categories) ? store.categories : [];

    for (const category of categories) {
      if (typeof category !== "object" || category === null) continue;
      const cat = category as Record<string, unknown>;

      if (Array.isArray(cat.constant_stock)) {
        for (const entry of cat.constant_stock) {
          processStoreEntry(entry, storeId, undefined, requirementContext, accumulator);
        }
      }

      const seasonal = cat.seasonal as Record<string, unknown> | undefined;
      if (seasonal) {
        for (const [season, itemsData] of Object.entries(seasonal)) {
          if (!Array.isArray(itemsData)) continue;
          const seasonAvailability: AvailabilityCondition = {
            seasons: [season as Season],
            type: "season",
          };
          for (const entry of itemsData) {
            processStoreEntry(entry, storeId, seasonAvailability, requirementContext, accumulator);
          }
        }
      }

      if (Array.isArray(cat.random_stock)) {
        for (const entry of cat.random_stock) {
          processStoreEntry(entry, storeId, undefined, requirementContext, accumulator, true);
        }
      }
    }
  }
}

function buildStoreSource(
  storeId: string,
  availability: AvailabilityCondition | undefined,
  isRandom: boolean,
): Source {
  return {
    ...(availability ? { availability } : {}),
    ...(isRandom ? { chance: 0 } : {}),
    storeId: storeId as StoreId,
    type: "store",
  };
}

function combineAvailability(
  base: AvailabilityCondition | undefined,
  requirement: AvailabilityCondition | undefined,
): AvailabilityCondition | undefined {
  if (!base && !requirement) return undefined;
  if (!base) return requirement;
  if (!requirement) return base;
  if (requirement.type === "always") return base;
  return simplifyAvailabilityCondition({
    conditions: [base, requirement],
    type: "all",
  });
}

function processStoreEntry(
  entry: unknown,
  storeId: string,
  baseAvailability: AvailabilityCondition | undefined,
  requirementContext: RequirementContext,
  accumulator: ItemSourceAccumulator,
  isRandom = false,
): void {
  if (typeof entry === "string") {
    const source = buildStoreSource(storeId, baseAvailability, isRandom);
    accumulator.add(entry as ItemId, source);
    return;
  }

  if (typeof entry !== "object" || entry === null) return;
  const obj = entry as Record<string, unknown>;

  if (obj.recipe_scroll || obj.crafting_scroll) return;

  const itemId = obj.item as string | undefined;
  const cosmeticId = obj.cosmetic as string | undefined;
  const targetId = itemId ?? cosmeticId;
  if (!targetId) return;

  let requirementAvailability: AvailabilityCondition | undefined;
  let upgradeName: string | undefined;
  let perkId: string | undefined;

  if (obj.requirements && typeof obj.requirements === "object") {
    const reqs = obj.requirements as Record<string, unknown>;

    for (const key of Object.keys(reqs)) {
      if (UPGRADE_PREDICATES.has(key)) {
        upgradeName = key;
      }
    }

    if (typeof reqs.has_perk === "string") {
      perkId = reqs.has_perk;
    }

    const sourceLocation: SourceFieldLocation = {
      entityId: `${storeId}/${targetId}`,
      fieldPath: "requirements",
      sourcePath: "fiddle/stores.toml",
    };

    const expression = parseRequirements(
      obj.requirements,
      requirementContext.namedRequirements,
      requirementContext.primitivePredicates,
      sourceLocation,
    );

    requirementAvailability = projectRequirementExpressionToAvailability(
      expression,
      requirementContext,
      sourceLocation,
    );
  }

  const availability = combineAvailability(baseAvailability, requirementAvailability);

  let source: Source;
  if (upgradeName) {
    source = {
      ...(availability ? { availability } : {}),
      storeId: storeId as StoreId,
      type: "upgrade",
      upgradeName,
    };
  } else if (perkId) {
    source = {
      ...(availability ? { availability } : {}),
      perkId: perkId as PerkId,
      storeId: storeId as StoreId,
      type: "store",
    };
  } else {
    source = buildStoreSource(storeId, availability, isRandom);
  }

  accumulator.add(targetId as ItemId, source);
}
