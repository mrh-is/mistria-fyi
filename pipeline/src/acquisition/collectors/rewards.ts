import { SEASONS } from "#lib/types/tracker-data.js";

import { expectNumber, expectRecord, expectString } from "../../data-shapes.js";
import { sourceFileFor } from "../../parse-fiddle.js";

import type { ActivityId, Source } from "#lib/types/acquisition.js";
import type {
  AnimalId,
  CosmeticId,
  DateId,
  FestivalId,
  ItemId,
  MuseumWingId,
  PetCosmeticSetId,
  QuestId,
  Season,
  StoreId,
  VillagerId,
} from "#lib/types/tracker-data.js";

import type { SourceFieldLocation } from "../../data-shapes.js";
import type { ParsedGameData } from "../../parse-fiddle.js";
import type {
  AnimalCosmeticSourceAccumulator,
  CosmeticSourceAccumulator,
  ItemSourceAccumulator,
  PetCosmeticSourceAccumulator,
} from "../source-accumulator.js";

type LetterRewardSource = Extract<
  Source,
  { type: "donate_item" | "reach_day" | "ship_item" | "spouseGift" | "wedding" }
>;

const FESTIVAL_SEASON_MAP: Record<string, Season> = {
  fall: "fall",
  harvest: "fall",
  spring: "spring",
  summer: "summer",
  winter: "winter",
};

function isSeason(value: string): value is Season {
  return SEASONS.some((season) => season === value);
}

const TEN_HEART_SUFFIX = "_ten_hearts";

export function collectRewardSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
  animalCosmeticAccumulator?: AnimalCosmeticSourceAccumulator,
  petCosmeticAccumulator?: PetCosmeticSourceAccumulator,
): void {
  collectQuestRewardSources(fiddle, accumulator, cosmeticAccumulator, animalCosmeticAccumulator);
  collectFestivalStockSources(fiddle, accumulator, cosmeticAccumulator, animalCosmeticAccumulator);
  collectAnimalFestivalRewardSources(fiddle, accumulator, animalCosmeticAccumulator);
  collectRenownRewardSources(fiddle, accumulator, cosmeticAccumulator);
  collectLetterRewardSources(fiddle, accumulator);
  collectMuseumDonationRewardSources(fiddle, accumulator, cosmeticAccumulator);
  collectProposalSources(fiddle, accumulator);
  collectDateSources(fiddle, accumulator);
  collectEngagementSources(fiddle, accumulator);
  collectWeddingCosmeticSources(fiddle, cosmeticAccumulator);
  collectChickenStatueLootSources(fiddle, animalCosmeticAccumulator, petCosmeticAccumulator);
}

const SMALL_ANIMAL_KINDS = ["capybara", "chicken", "duck", "rabbit"];
const LARGE_ANIMAL_KINDS = ["alpaca", "cow", "horse", "sheep"];

function classifyLetterTrigger(
  reqs: Record<string, unknown> | undefined,
  context: SourceFieldLocation,
): LetterRewardSource {
  if (!reqs) {
    return {
      type: "reach_day",
      triggerDate: { day: 1, season: "spring" },
    };
  }

  if (typeof reqs.is_spouse === "string") {
    return { type: "spouseGift", villagerId: reqs.is_spouse as VillagerId };
  }

  if (typeof reqs.shipped_item === "string") {
    return { type: "ship_item", triggerItemId: reqs.shipped_item as ItemId };
  }

  if (typeof reqs.donated_item === "string") {
    return { type: "donate_item", triggerItemId: reqs.donated_item as ItemId };
  }

  if (reqs.reached_date !== undefined) {
    const reachedDate = expectRecord(reqs.reached_date, context);
    const season =
      reachedDate.season === undefined
        ? "spring"
        : expectString(reachedDate.season, {
            ...context,
            fieldPath: `${context.fieldPath}.season`,
          });
    if (!isSeason(season)) {
      throw new Error(
        `Invalid season for ${context.entityId}.${context.fieldPath}.season in ${context.sourcePath}`,
      );
    }
    return {
      type: "reach_day",
      triggerDate: {
        day:
          reachedDate.day === undefined
            ? 1
            : expectNumber(reachedDate.day, { ...context, fieldPath: `${context.fieldPath}.day` }),
        season,
        ...(reachedDate.year === undefined
          ? {}
          : {
              year: expectNumber(reachedDate.year, {
                ...context,
                fieldPath: `${context.fieldPath}.year`,
              }),
            }),
      },
    };
  }

  return {
    type: "reach_day",
    triggerDate: { day: 1, season: "spring" },
  };
}

function collectAnimalFestivalRewardSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  animalCosmeticAccumulator?: AnimalCosmeticSourceAccumulator,
): void {
  const misc = fiddle.misc as Record<string, unknown> | undefined;
  if (!misc) return;

  const festivalSource: Source = {
    type: "festival_activity",
    activityId: "animal_contest" as ActivityId,
    festivalId: "animal" as FestivalId,
  };

  const expandRewards = (rewards: unknown, animalKinds: string[]): void => {
    if (!Array.isArray(rewards)) return;

    for (const entry of rewards) {
      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;
      const template = obj.placeable as string | undefined;
      if (!template) continue;

      for (const kind of animalKinds) {
        const itemId = template.replace("{AnimalKind}", kind) as ItemId;
        accumulator.add(itemId, festivalSource);
      }

      const cosmeticId = obj.cosmetic as CosmeticId | undefined;
      if (cosmeticId && animalCosmeticAccumulator) {
        for (const kind of animalKinds) {
          animalCosmeticAccumulator.add(kind as AnimalId, cosmeticId, festivalSource);
        }
      }
    }
  };

  expandRewards(misc.small_animal_festival_rewards, SMALL_ANIMAL_KINDS);
  expandRewards(misc.large_animal_festival_rewards, LARGE_ANIMAL_KINDS);
}

function collectChickenStatueLootSources(
  fiddle: ParsedGameData,
  animalCosmeticAccumulator?: AnimalCosmeticSourceAccumulator,
  petCosmeticAccumulator?: PetCosmeticSourceAccumulator,
): void {
  const chickenStatue = fiddle.chicken_statue as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!chickenStatue) return;

  const misc = fiddle.misc as Record<string, unknown> | undefined;
  const chickenMisc = (misc?.chicken_statue as Record<string, unknown>) ?? {};
  const cost = (chickenMisc.low_price as number | undefined) ?? 10;

  for (const [, tier] of Object.entries(chickenStatue)) {
    if (typeof tier !== "object" || tier === null) continue;
    for (const rollKey of ["small_roll", "large_roll"]) {
      const rolls = tier[rollKey];
      if (!Array.isArray(rolls)) continue;

      for (const entry of rolls) {
        if (typeof entry !== "object" || entry === null) continue;
        const obj = entry as Record<string, unknown>;

        const animalCosmeticId = obj.animal_cosmetic as CosmeticId | undefined;
        const animalId = obj.animal as AnimalId | undefined;
        if (animalCosmeticId && animalId && animalCosmeticAccumulator) {
          animalCosmeticAccumulator.add(animalId, animalCosmeticId, {
            type: "chicken_statue",
            cost,
          });
        }

        const petCosmeticId = obj.pet_cosmetic as PetCosmeticSetId | undefined;
        if (petCosmeticId && petCosmeticAccumulator) {
          petCosmeticAccumulator.add(petCosmeticId, {
            type: "chicken_statue",
            cost,
          });
        }
      }
    }
  }
}

function collectDateSources(fiddle: ParsedGameData, accumulator: ItemSourceAccumulator): void {
  const dates = fiddle.dates as Record<string, Record<string, unknown>> | undefined;
  if (!dates) return;

  for (const [dateId, dateData] of Object.entries(dates)) {
    if (dateId === "default" || typeof dateData !== "object" || dateData === null) continue;

    const photoItem = dateData.photo_item as ItemId | undefined;
    if (photoItem && photoItem !== "<n/a>") {
      accumulator.add(photoItem, {
        type: "date",
        dateId: dateId as DateId,
      });
    }
  }
}

function collectEngagementSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
): void {
  const cutscenes = fiddle.cutscenes as Record<string, Record<string, unknown>> | undefined;
  if (!cutscenes) return;

  const engagement = cutscenes.engagement_tutorial as Record<string, unknown> | undefined;
  if (engagement) {
    const givenItems = Array.isArray(engagement.given_items) ? engagement.given_items : [];
    for (const entry of givenItems) {
      if (typeof entry !== "object" || entry === null) continue;
      const itemId = (entry as Record<string, unknown>).item_id as ItemId | undefined;
      if (itemId) {
        accumulator.add(itemId, { type: "engagement" });
      }
    }
  }

  const wedding = cutscenes.wedding as Record<string, unknown> | undefined;
  if (wedding) {
    const givenItems = Array.isArray(wedding.given_items) ? wedding.given_items : [];
    for (const entry of givenItems) {
      if (typeof entry !== "object" || entry === null) continue;
      const itemId = (entry as Record<string, unknown>).item_id as ItemId | undefined;
      if (itemId) {
        accumulator.add(itemId, { type: "wedding" });
      }
    }
  }
}

function collectFestivalStockSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
  animalCosmeticAccumulator?: AnimalCosmeticSourceAccumulator,
): void {
  const festivals = fiddle.festivals as Record<string, Record<string, unknown>> | undefined;
  if (!festivals) return;

  for (const [festivalId, fest] of Object.entries(festivals)) {
    if (festivalId === "default" || typeof fest !== "object" || fest === null) continue;

    const stocks = fest.stocks as Record<string, unknown> | undefined;
    if (!stocks) continue;

    const season = FESTIVAL_SEASON_MAP[festivalId];

    for (const [storeId, stockData] of Object.entries(stocks)) {
      if (storeId === "default" || !Array.isArray(stockData)) continue;

      for (const entry of stockData) {
        if (typeof entry !== "object" || entry === null) continue;
        const obj = entry as Record<string, unknown>;

        const source: Source = {
          ...(season ? { availability: { type: "season" as const, seasons: [season] } } : {}),
          type: "festival",
          festivalId: festivalId as FestivalId,
          storeId: storeId as StoreId,
        };

        const animalCosmeticId = obj.animal_cosmetic as CosmeticId | undefined;
        const animalId = obj.animal as AnimalId | undefined;
        if (animalCosmeticId && animalId && animalCosmeticAccumulator) {
          animalCosmeticAccumulator.add(animalId, animalCosmeticId, source);
          continue;
        }

        const cosmeticId = obj.cosmetic as CosmeticId | undefined;
        const itemId = obj.item as ItemId | undefined;
        const targetId = cosmeticId ?? itemId;
        if (!targetId) continue;

        if (cosmeticId && cosmeticAccumulator) {
          cosmeticAccumulator.add(cosmeticId, source);
        } else {
          accumulator.add(targetId as ItemId, source);
        }
      }
    }
  }
}

function collectLetterRewardSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
): void {
  const letters = fiddle.letters as Record<string, Record<string, unknown>> | undefined;
  if (!letters) return;

  for (const [letterId, letter] of Object.entries(letters)) {
    if (typeof letter !== "object" || letter === null) continue;

    const items = Array.isArray(letter.items) ? letter.items : [];
    if (items.length === 0) continue;

    const reqs = letter.requirements as Record<string, unknown> | undefined;
    const source = classifyLetterTrigger(reqs, {
      entityId: letterId,
      fieldPath: "requirements.reached_date",
      sourcePath: sourceFileFor(fiddle, `letters.${letterId}`),
    });

    for (const entry of items) {
      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;

      if (obj.recipe_scroll || obj.crafting_scroll) {
        const scrollTarget = (obj.recipe_scroll ?? obj.crafting_scroll) as ItemId;
        accumulator.add(scrollTarget, source);
        continue;
      }

      const itemId = obj.item_name as ItemId | undefined;
      if (itemId) {
        accumulator.add(itemId, source);
      }
    }
  }
}

function collectMuseumDonationRewardSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
): void {
  const wings = fiddle.museum_wings as Record<string, Record<string, unknown>> | undefined;
  if (!wings) return;

  for (const [wingId, wing] of Object.entries(wings)) {
    if (typeof wing !== "object" || wing === null) continue;

    const rewards: unknown[] = Array.isArray(wing.rewards) ? wing.rewards : [];

    for (let i = 0; i < rewards.length; i++) {
      const reward = rewards[i];
      if (typeof reward !== "object" || reward === null) continue;
      const rewardObj = reward as Record<string, unknown>;

      const entries = Array.isArray(rewardObj.entries) ? rewardObj.entries : [];
      const setCount = i + 1;

      for (const entry of entries) {
        if (typeof entry !== "object" || entry === null) continue;
        const obj = entry as Record<string, unknown>;

        if (obj.crafting_scroll || obj.recipe_scroll) continue;

        const cosmeticId = obj.cosmetic as CosmeticId | undefined;
        const itemId = obj.item as ItemId | undefined;
        const targetId = cosmeticId ?? itemId;
        if (!targetId) continue;

        const source: Source = {
          type: "museum_donation",
          setCount,
          wingId: wingId as MuseumWingId,
        };

        if (cosmeticId && cosmeticAccumulator) {
          cosmeticAccumulator.add(cosmeticId, source);
        } else {
          accumulator.add(targetId as ItemId, source);
        }
      }
    }
  }
}

function collectProposalSources(fiddle: ParsedGameData, accumulator: ItemSourceAccumulator): void {
  const cutscenes = fiddle.cutscenes as Record<string, Record<string, unknown>> | undefined;
  if (!cutscenes) return;

  for (const [sceneId, scene] of Object.entries(cutscenes)) {
    if (!sceneId.endsWith(TEN_HEART_SUFFIX)) continue;
    if (typeof scene !== "object" || scene === null) continue;

    const villagerId = sceneId.slice(0, -TEN_HEART_SUFFIX.length) as VillagerId;
    const givenItems = Array.isArray(scene.given_items) ? scene.given_items : [];

    for (const entry of givenItems) {
      if (typeof entry !== "object" || entry === null) continue;
      const itemId = (entry as Record<string, unknown>).item_id as ItemId | undefined;
      if (itemId) {
        accumulator.add(itemId, {
          type: "proposal",
          villagerId,
        });
      }
    }
  }
}

function collectQuestRewardSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
  animalCosmeticAccumulator?: AnimalCosmeticSourceAccumulator,
): void {
  const quests = fiddle.quests as Record<string, Record<string, unknown>> | undefined;
  if (!quests) return;

  for (const questGroup of Object.values(quests)) {
    if (typeof questGroup !== "object" || questGroup === null) continue;

    for (const [questId, quest] of Object.entries(questGroup)) {
      if (questId === "default" || typeof quest !== "object" || quest === null) continue;

      const questData = quest as Record<string, unknown>;
      const rewards: unknown[] = Array.isArray(questData.rewards) ? questData.rewards : [];
      processQuestRewards(
        rewards,
        questId,
        accumulator,
        cosmeticAccumulator,
        animalCosmeticAccumulator,
      );

      const stages = Array.isArray(questData.stages) ? questData.stages : [];
      for (const stage of stages) {
        if (typeof stage !== "object" || stage === null) continue;
        const stageData = stage as Record<string, unknown>;
        const stageRewards = Array.isArray(stageData.rewards) ? stageData.rewards : [];
        processQuestRewards(
          stageRewards,
          questId,
          accumulator,
          cosmeticAccumulator,
          animalCosmeticAccumulator,
        );
      }
    }
  }
}

function collectRenownRewardSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
): void {
  const renown = fiddle.renown as Record<string, unknown> | undefined;
  if (!renown) return;

  const rewards: unknown[] = Array.isArray(renown.rewards) ? renown.rewards : [];

  for (let i = 0; i < rewards.length; i++) {
    const reward = rewards[i];
    if (typeof reward !== "object" || reward === null) continue;
    const obj = reward as Record<string, unknown>;
    const cosmeticId = obj.cosmetic as CosmeticId | undefined;
    const itemId = obj.item as ItemId | undefined;
    const targetId = cosmeticId ?? itemId;
    if (!targetId) continue;

    const source: Source = {
      type: "renown",
      level: i + 1,
    };

    if (cosmeticId && cosmeticAccumulator) {
      cosmeticAccumulator.add(cosmeticId, source);
    } else {
      accumulator.add(targetId as ItemId, source);
    }
  }
}

function collectWeddingCosmeticSources(
  fiddle: ParsedGameData,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
): void {
  if (!cosmeticAccumulator) return;

  const misc = fiddle.misc as Record<string, unknown> | undefined;
  const weddingAssets = misc?.wedding_assets;
  if (!Array.isArray(weddingAssets)) return;

  for (const cosmeticId of weddingAssets) {
    if (typeof cosmeticId === "string") {
      cosmeticAccumulator.add(cosmeticId as CosmeticId, { type: "wedding" });
    }
  }
}

function processQuestRewards(
  rewards: unknown[],
  questId: string,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator?: CosmeticSourceAccumulator,
  animalCosmeticAccumulator?: AnimalCosmeticSourceAccumulator,
): void {
  for (const reward of rewards) {
    if (typeof reward !== "object" || reward === null) continue;
    const obj = reward as Record<string, unknown>;

    if (obj.item) {
      accumulator.add(obj.item as ItemId, {
        type: "quest",
        questId: questId as QuestId,
        trigger: "completion",
      });
    }

    if (obj.player_cosmetic && cosmeticAccumulator) {
      cosmeticAccumulator.add(obj.player_cosmetic as CosmeticId, {
        type: "quest",
        questId: questId as QuestId,
        trigger: "completion",
      });
    }

    const animalCosmeticId = obj.animal_cosmetic as CosmeticId | undefined;
    const animalId = obj.animal as AnimalId | undefined;
    if (animalCosmeticId && animalId && animalCosmeticAccumulator) {
      animalCosmeticAccumulator.add(animalId, animalCosmeticId, {
        type: "quest",
        questId: questId as QuestId,
        trigger: "completion",
      });
    }

    if (obj.tiers && Array.isArray(obj.tiers)) {
      for (const tier of obj.tiers) {
        if (typeof tier !== "object" || tier === null) continue;
        const tierRewards = Array.isArray((tier as Record<string, unknown>).rewards)
          ? ((tier as Record<string, unknown>).rewards as unknown[])
          : [];
        processQuestRewards(
          tierRewards,
          questId,
          accumulator,
          cosmeticAccumulator,
          animalCosmeticAccumulator,
        );
      }
    }
  }
}
