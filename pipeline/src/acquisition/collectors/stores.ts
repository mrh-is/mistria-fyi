import { simplifyAvailabilityCondition } from "#lib/engine/availability-condition.js";

import { forEachStockEntry } from "../../extractor-helpers.js";
import { parseRequirements } from "../../requirements.js";
import { projectRequirementExpressionToAvailability } from "../availability.js";

import type { AvailabilityCondition, Source } from "#lib/types/acquisition.js";
import type { AnimalId, CosmeticId, ItemId, Season, StoreId } from "#lib/types/tracker-data.js";

import type { SourceFieldLocation } from "../../data-shapes.js";
import type { ParsedGameData } from "../../parse-fiddle.js";
import type { RequirementContext } from "../../requirements.js";
import type {
  AnimalCosmeticSourceAccumulator,
  CosmeticSourceAccumulator,
  ItemSourceAccumulator,
} from "../source-accumulator.js";

export function collectStoreSources(
  fiddle: ParsedGameData,
  requirementContext: RequirementContext,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
  animalCosmeticAccumulator?: AnimalCosmeticSourceAccumulator,
): void {
  forEachStockEntry(fiddle, (storeId, entry, season) => {
    const seasonAvailability: AvailabilityCondition | undefined =
      season === undefined ? undefined : { type: "season", seasons: [season as Season] };
    processStoreEntry(
      entry,
      storeId,
      seasonAvailability,
      requirementContext,
      accumulator,
      cosmeticAccumulator,
      animalCosmeticAccumulator,
    );
  });
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
  animalCosmeticAccumulator?: AnimalCosmeticSourceAccumulator,
): void {
  if (typeof entry === "string") {
    const source = buildStoreSource(storeId, baseAvailability);
    accumulator.add(entry as ItemId, source);
    return;
  }

  if (typeof entry !== "object" || entry === null) return;
  const obj = entry as Record<string, unknown>;

  if (obj.recipe_scroll || obj.crafting_scroll) return;

  const animalCosmeticId = obj.animal_cosmetic as CosmeticId | undefined;
  const animalId = obj.animal as AnimalId | undefined;
  if (animalCosmeticId && animalId && animalCosmeticAccumulator) {
    let requirementAvailability: AvailabilityCondition | undefined;
    if (obj.requirements && typeof obj.requirements === "object") {
      const sourceLocation: SourceFieldLocation = {
        entityId: `${storeId}/${animalId}:${animalCosmeticId}`,
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
    const source = buildStoreSource(storeId, availability);
    animalCosmeticAccumulator.add(animalId, animalCosmeticId, source);
    return;
  }

  const itemId = obj.item as ItemId | undefined;
  const cosmeticId = obj.cosmetic as CosmeticId | undefined;
  const targetId = itemId ?? cosmeticId;
  if (!targetId) return;

  let requirementAvailability: AvailabilityCondition | undefined;

  if (obj.requirements && typeof obj.requirements === "object") {
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
  const source = buildStoreSource(storeId, availability);

  if (cosmeticId && cosmeticAccumulator) {
    cosmeticAccumulator.add(targetId as CosmeticId, source);
  } else {
    accumulator.add(targetId as ItemId, source);
  }
}
