import type {
  AnimalId,
  BiomeId,
  FestivalId,
  ItemId,
  NpcId,
  PerkId,
  QuestId,
  QuestType,
  RecipeId,
  Season,
  SkillId,
  StoreId,
  TreasureChestTier,
  Weather,
  WingId,
} from "./tracker-data.js";
import type { VisibilityCondition } from "./visibility.js";

export type ActivityId = string & { readonly __brand: "ActivityId" };
export type AvailabilityCondition =
  | { condition: AvailabilityCondition; type: "not" }
  | { conditions: AvailabilityCondition[]; type: "all" }
  | { conditions: AvailabilityCondition[]; type: "any" }
  | { floor: number; type: "minesLevel" }
  | { level: number; npcId: NpcId; type: "heartLevel" }
  | { level: number; skillId: SkillId; type: "skillLevel" }
  | { perkId: PerkId; type: "perkUnlocked" }
  | { predicate: string; type: "gamePredicate"; value: JsonValue }
  | { questId: QuestId; state: "available" | "completed"; type: "quest" }
  | { seasons: Season[]; type: "season" }
  | { start: number; end: number; type: "time" }
  | { type: "always" }
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
        | { activity: "crop_harvest"; perkId: PerkId; type: "perk_drop" }
        | { activityId: ActivityId; festivalId: FestivalId; type: "festival_activity" }
        | { animalId: AnimalId; type: "animal_product" }
        | { biomeId: BiomeId; lootGroup?: DungeonLootGroup; perkId?: PerkId; type: "mines_chest" }
        | { biomeId: BiomeId; perkId: PerkId; type: "mines_dig_site" }
        | { biomeId: BiomeId; type: "mine" }
        | { bundleName: string; storeId: StoreId; type: "scroll_bundle" }
        | {
            challengeRecipeId?: RecipeId;
            choiceId?: DialogueChoiceId;
            questId: QuestId;
            questType?: QuestType;
            requestedItemId?: ItemId;
            trigger: "completion" | "dialogue_choice";
            type: "quest";
          }
        | { cost: { amount: number; currency: "beads" }; type: "chicken_statue" }
        | { cost: { amount: number; currency: "tesserae" }; type: "wishing_well" }
        | { dateId: DateId; type: "date" }
        | { festivalId: FestivalId; storeId?: StoreId; type: "festival" }
        | { itemId: ItemId; type: "equipment" }
        | { level: number; type: "renown" }
        | { locationIds?: LocationId[]; type: "artifact_dig" }
        | { locationIds?: LocationId[]; type: "bug_catch" }
        | { locationIds?: LocationId[]; type: "forage" }
        | { method: ProductionMethod; recipeId: RecipeId; type: "recipe" }
        | { monsterId: MonsterId; type: "monster" }
        | { monsterId: MonsterId; type: "monster_feed" }
        | { npcId: NpcId; type: "proposal" }
        | { originalItemId: ItemId; type: "artifact_replicator" }
        | { perkId: PerkId; type: "perk" }
        | { perkId: PerkId; type: "ritual_chamber" }
        | { saplingItemId: ItemId; type: "tree" }
        | { seedItemId: ItemId; type: "crop" }
        | { setCount: number; type: "museum_donation"; wingId: WingId }
        | { stationId: StationId; type: "station" }
        | { storeId: StoreId; type: "store" }
        | { storeId: StoreId; type: "upgrade"; upgradeName: string }
        | { tier: TreasureChestTier; type: "treasure_chest" }
        | { trigger: "donated_item"; triggerItemId: ItemId; type: "letter" }
        | {
            trigger: "reached_date";
            triggerDate: { day: number; season: Season; year?: number };
            type: "letter";
          }
        | { trigger: "shipped_item"; triggerItemId: ItemId; type: "letter" }
        | { type: "beach_cave_chest" }
        | { type: "breed" }
        | { type: "dive"; waterTypes?: WaterType[] }
        | { type: "engagement" }
        | { type: "fish"; waterTypes?: WaterType[] }
        | { type: "fish_trap" }
        | { type: "wedding" }
      ))
  | { type: "default" };

export interface SourceDetails {
  availability?: AvailabilityCondition;
  chance?: number;
  cost?: { amount: number; currency: "beads" | "tesserae" | "tickets" };
  visibility?: VisibilityCondition;
  weight?: number;
}

export type SourceTuple = [Source, ...Source[]];

export type StationId = string & { readonly __brand: "StationId" };

export type WaterType = string & { readonly __brand: "WaterType" };
