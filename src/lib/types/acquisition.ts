import type { NonEmptyArray } from "$lib/utils.js";

import type {
  AnimalId,
  Day,
  FestivalId,
  ItemId,
  MinesBiomeId,
  MuseumWingId,
  NpcId,
  PerkId,
  QuestId,
  QuestType,
  RecipeId,
  Season,
  SkillId,
  StoreId,
  TreasureChestTierId,
  Weather,
} from "./tracker-data.js";
import type { QuestVisibility, VisibilityCondition } from "./visibility.js";

export type ActivityId = string & { readonly __brand: "ActivityId" };
export type AvailabilityCondition =
  | { type: "all"; conditions: NonEmptyArray<AvailabilityCondition> }
  | { type: "always" }
  | { type: "any"; conditions: NonEmptyArray<AvailabilityCondition> }
  | { type: "gamePredicate"; predicate: string; value: JsonValue }
  | { type: "hasUpperFloor" }
  | { type: "heartLevel"; level: number; npcId: NpcId }
  | { type: "isDating" }
  | { type: "minesLevel"; floor: number }
  | { type: "not"; condition: AvailabilityCondition }
  | { type: "perkUnlocked"; perkId: PerkId }
  | { type: "quest"; questId: QuestId; state: Omit<QuestVisibility, "unavailable"> }
  | { type: "reachedSeason"; season: Season }
  | { type: "season"; seasons: NonEmptyArray<Season> }
  | { type: "skillLevel"; level: number; skillId: SkillId }
  | { type: "time"; start: number; end: number }
  | { type: "weather"; weathers: Weather[] };
export type DateId = string & { readonly __brand: "DateId" };
export type DialogueChoiceId = string & { readonly __brand: "DialogueChoiceId" };
export type DungeonLootGroup = string & { readonly __brand: "DungeonLootGroup" };
export type JsonValue =
  boolean | JsonValue[] | null | number | string | { [key: string]: JsonValue };
export type LocationId = string & { readonly __brand: "LocationId" };
export type MonsterId = string & { readonly __brand: "MonsterId" };
export type ProductionMethod = "cook" | "craft" | "dragon_forge" | "mill" | "smith";
export type Source =
  | (SourceDetails &
      (
        | { type: "animal_product"; animalId: AnimalId }
        | { type: "artifact_dig"; locationIds?: NonEmptyArray<LocationId> }
        | { type: "artifact_replicator"; originalItemId: ItemId }
        | { type: "bait_fish"; baitItemIds: NonEmptyArray<ItemId> }
        | { type: "beach_cave_chest" }
        | { type: "breed" }
        | { type: "bug_catch"; locationIds?: NonEmptyArray<LocationId> }
        | { type: "chicken_statue"; cost: number }
        | { type: "crop"; seedItemId: ItemId }
        | { type: "date"; dateId: DateId }
        | { type: "date_inspiration"; itemId: ItemId }
        | { type: "dive"; waterTypes?: NonEmptyArray<WaterType> }
        | { type: "donate_item"; triggerItemId: ItemId }
        | { type: "engagement" }
        | { type: "equipment"; itemId: ItemId }
        | { type: "festival"; festivalId: FestivalId; storeId?: StoreId }
        | { type: "festival_activity"; activityId: ActivityId; festivalId: FestivalId }
        | { type: "fish"; waterTypes?: NonEmptyArray<WaterType> }
        | { type: "fish_trap"; baitItemIds: NonEmptyArray<ItemId> }
        | { type: "forage"; locationIds?: NonEmptyArray<LocationId> }
        | { type: "lost_and_found" }
        | { type: "mine"; biomeId: MinesBiomeId }
        | { type: "mine_fish"; biomeId?: MinesBiomeId }
        | {
            type: "mines_chest";
            biomeId: MinesBiomeId;
            lootGroup?: DungeonLootGroup;
            perkId?: PerkId;
          }
        | { type: "mines_dig_site"; biomeId: MinesBiomeId; perkId: PerkId }
        | { type: "monster"; monsterId: MonsterId }
        | { type: "monster_feed"; monsterId: MonsterId }
        | { type: "museum_donation"; setCount: number; wingId: MuseumWingId }
        | { type: "perk"; perkId: PerkId }
        | { type: "perk_drop"; activity: "crop_harvest"; perkId: PerkId }
        | { type: "proposal"; npcId: NpcId }
        | {
            type: "quest";
            challengeRecipeId?: RecipeId;
            choiceId?: DialogueChoiceId;
            questId: QuestId;
            questType?: QuestType;
            requestedItemId?: ItemId;
            trigger: "completion" | "dialogue_choice";
          }
        | { type: "reach_day"; triggerDate: Day & { year?: number } }
        | { type: "recipe"; method: ProductionMethod; recipeId: RecipeId }
        | { type: "renown"; level: number }
        | { type: "ritual_chamber"; perkId: PerkId }
        | { type: "scroll_bundle"; bundleName: string; storeId: StoreId }
        | { type: "ship_item"; triggerItemId: ItemId }
        | { type: "spouseGift"; npcId: NpcId }
        | { type: "station"; stationId: StationId }
        | { type: "store"; storeId: StoreId }
        | { type: "treasure_chest"; tier: TreasureChestTierId }
        | { type: "tree"; saplingItemId: ItemId }
        | { type: "upgrade"; storeId: StoreId; upgradeName: string }
        | { type: "wedding" }
        | { type: "wishing_well"; cost: number }
      ))
  | { type: "default" };
export interface SourceDetails {
  availability?: AvailabilityCondition;
  visibility?: VisibilityCondition;
}
export type SourceTuple = NonEmptyArray<Source>;
export type StationId = string & { readonly __brand: "StationId" };
export type WaterType = string & { readonly __brand: "WaterType" };
