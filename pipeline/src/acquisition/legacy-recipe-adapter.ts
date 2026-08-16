import type { AvailabilityCondition, Source } from "$lib/types/acquisition.js";
import type { LegacyRecipeSource, Restriction } from "$lib/types/tracker-data.js";
import type { VisibilityCondition } from "$lib/types/visibility.js";

export function toLegacyRecipeSource(source: Source): LegacyRecipeSource {
  const details = source.type === "default" ? {} : legacyDetails(source);
  let projected: LegacyRecipeSource;

  switch (source.type) {
    case "beach_cave_chest":
    case "default":
    case "engagement":
      projected = { type: source.type };
      break;
    case "chicken_statue":
      projected = { cost: source.cost.amount, type: source.type };
      break;
    case "festival":
      if (!source.storeId) throw unrepresentable(source.type, "festival source has no storeId");
      projected = { festivalId: source.festivalId, storeId: source.storeId, type: source.type };
      break;
    case "letter":
      switch (source.trigger) {
        case "donated_item":
        case "shipped_item":
          projected = {
            trigger: source.trigger,
            triggerItemId: source.triggerItemId,
            type: source.type,
          };
          break;
        case "reached_date":
          projected = {
            trigger: source.trigger,
            triggerDate: source.triggerDate,
            type: source.type,
          };
          break;
      }
      break;
    case "mines_chest":
      if (!source.perkId) throw unrepresentable(source.type, "mines_chest source has no perkId");
      if (source.lootGroup) {
        throw unrepresentable(source.type, "lootGroup cannot be preserved by the legacy contract");
      }
      projected = {
        biomeId: source.biomeId,
        perkId: source.perkId,
        type: source.type,
      };
      break;
    case "mines_dig_site":
      projected = {
        biomeId: source.biomeId,
        perkId: source.perkId,
        type: source.type,
      };
      break;
    case "museum_donation":
      projected = {
        setCount: source.setCount,
        type: source.type,
        wingId: source.wingId,
      };
      break;
    case "perk":
      projected = { perkId: source.perkId, type: source.type };
      break;
    case "quest":
      if (!source.questType) throw unrepresentable(source.type, "quest source has no questType");
      if (source.trigger !== "completion" || source.choiceId) {
        throw unrepresentable(source.type, "dialogue-choice quest details are not representable");
      }
      projected = {
        challengeRecipeId: source.challengeRecipeId,
        questId: source.questId,
        questType: source.questType,
        requestedItemId: source.requestedItemId,
        type: source.type,
      };
      break;
    case "renown":
      projected = { level: source.level, type: source.type };
      break;
    case "scroll_bundle":
      projected = {
        bundleName: source.bundleName,
        storeId: source.storeId,
        type: source.type,
      };
      break;
    case "store":
      projected = { storeId: source.storeId, type: source.type };
      break;
    case "treasure_chest":
      projected = { tier: source.tier, type: source.type };
      break;
    case "upgrade":
      projected = {
        storeId: source.storeId,
        type: source.type,
        upgradeName: source.upgradeName,
      };
      break;
    case "wishing_well":
      projected = { cost: source.cost.amount, type: source.type };
      break;
    case "animal_product":
    case "artifact_dig":
    case "artifact_replicator":
    case "bug_catch":
    case "crop":
    case "date":
    case "dive":
    case "equipment":
    case "festival_activity":
    case "fish":
    case "fish_trap":
    case "forage":
    case "mine":
    case "monster":
    case "monster_feed":
    case "perk_drop":
    case "proposal":
    case "recipe":
    case "ritual_chamber":
    case "station":
    case "tree":
    case "wedding":
      throw unrepresentable(source.type, `source type "${source.type}" is not representable`);
  }

  return { ...projected, ...details };
}

function flattenAvailability(
  condition: AvailabilityCondition,
  sourceType: Source["type"],
): Restriction[] {
  switch (condition.type) {
    case "all":
      return condition.conditions.flatMap((child) => flattenAvailability(child, sourceType));
    case "always":
      return [];
    case "minesLevel":
      return [{ level: condition.floor, type: "minesLevel" }];
    case "perkUnlocked":
      return [{ perk: condition.perkId, type: "perk" }];
    case "season":
      return [{ seasons: condition.seasons, type: "season" }];
    case "skillLevel":
      return [{ level: condition.level, skill: condition.skillId, type: "skill" }];
    case "time":
      return [{ hours: [condition.start, condition.end], type: "time" }];
    case "weather":
      return [{ type: "weather", weathers: condition.weathers }];
    case "any":
    case "gamePredicate":
    case "heartLevel":
    case "not":
    case "quest":
      throw unrepresentable(sourceType, `availability type "${condition.type}" is not flattenable`);
  }
}

function legacyDetails(source: Exclude<Source, { type: "default" }>): {
  restrictions?: Restriction[];
  visibility?: VisibilityCondition;
} {
  if (source.chance !== undefined || source.weight !== undefined) {
    throw unrepresentable(source.type, "chance and weight are not representable");
  }
  if (source.cost && source.type !== "chicken_statue" && source.type !== "wishing_well") {
    throw unrepresentable(source.type, "cost is not representable for this source type");
  }
  const restrictions = source.availability
    ? flattenAvailability(source.availability, source.type)
    : [];
  return {
    ...(restrictions.length > 0 ? { restrictions } : {}),
    ...(source.visibility ? { visibility: source.visibility } : {}),
  };
}

function unrepresentable(sourceType: Source["type"], reason: string): Error {
  return new Error(
    `Cannot project canonical ${sourceType} source to LegacyRecipeSource: ${reason}`,
  );
}
