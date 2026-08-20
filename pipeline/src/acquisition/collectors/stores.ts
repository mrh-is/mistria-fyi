import { simplifyAvailabilityCondition } from "$lib/engine/availability-condition.js";

import { parseRequirements } from "../../requirements.js";
import { projectRequirementExpressionToAvailability } from "../availability.js";

import type { AvailabilityCondition, Source } from "$lib/types/acquisition.js";
import type { CosmeticId, ItemId, Season, StoreId } from "$lib/types/tracker-data.js";

import type { SourceFieldLocation } from "../../data-shapes.js";
import type { ParsedGameData } from "../../parse-fiddle.js";
import type { RequirementContext } from "../../requirements.js";
import type { CosmeticSourceAccumulator, ItemSourceAccumulator } from "../source-accumulator.js";

const UPGRADE_PREDICATES = new Set([
  "repaired_carpenters_shop",
  "repaired_general_store",
  "repaired_inn",
]);

export function collectStoreSources(
  fiddle: ParsedGameData,
  requirementContext: RequirementContext,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
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
          processStoreEntry(
            entry,
            storeId,
            undefined,
            requirementContext,
            accumulator,
            cosmeticAccumulator,
          );
        }
      }

      const seasonal = cat.seasonal as Record<string, unknown> | undefined;
      if (seasonal) {
        for (const [season, itemsData] of Object.entries(seasonal)) {
          if (!Array.isArray(itemsData)) continue;
          const seasonAvailability: AvailabilityCondition = {
            type: "season",
            seasons: [season as Season],
          };
          for (const entry of itemsData) {
            processStoreEntry(
              entry,
              storeId,
              seasonAvailability,
              requirementContext,
              accumulator,
              cosmeticAccumulator,
            );
          }
        }
      }

      if (Array.isArray(cat.random_stock)) {
        for (const entry of cat.random_stock) {
          processStoreEntry(
            entry,
            storeId,
            undefined,
            requirementContext,
            accumulator,
            cosmeticAccumulator,
          );
        }
      }
    }
  }
}

function buildStoreSource(
  storeId: string,
  availability: AvailabilityCondition | undefined,
): Source {
  return {
    ...(availability ? { availability } : {}),
    type: "store",
    storeId: storeId as StoreId,
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
    type: "all",
    conditions: [base, requirement],
  });
}

function processStoreEntry(
  entry: unknown,
  storeId: string,
  baseAvailability: AvailabilityCondition | undefined,
  requirementContext: RequirementContext,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
): void {
  if (typeof entry === "string") {
    const source = buildStoreSource(storeId, baseAvailability);
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
      type: "upgrade",
      storeId: storeId as StoreId,
      upgradeName,
    };
  } else if (perkId) {
    source = {
      ...(availability ? { availability } : {}),
      type: "store",
      storeId: storeId as StoreId,
    };
  } else {
    source = buildStoreSource(storeId, availability);
  }

  if (cosmeticId && cosmeticAccumulator) {
    cosmeticAccumulator.add(targetId as CosmeticId, source);
  } else {
    accumulator.add(targetId as ItemId, source);
  }
}
