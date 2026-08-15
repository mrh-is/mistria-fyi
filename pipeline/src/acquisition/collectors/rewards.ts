import type { FestivalId, ItemId, QuestId, Season, StoreId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse-fiddle.js";
import type { ItemSourceAccumulator } from "../source-accumulator.js";

const FESTIVAL_SEASON_MAP: Record<string, Season> = {
  fall: "fall",
  harvest: "fall",
  spring: "spring",
  summer: "summer",
  winter: "winter",
};

export function collectRewardSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
): void {
  collectQuestRewardSources(fiddle, accumulator);
  collectFestivalStockSources(fiddle, accumulator);
  collectRenownRewardSources(fiddle, accumulator);
}

function collectFestivalStockSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
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
        const targetId = (obj.cosmetic as string) ?? (obj.item as string);
        if (!targetId) continue;

        accumulator.add(targetId as ItemId, {
          ...(season ? { availability: { seasons: [season], type: "season" as const } } : {}),
          festivalId: festivalId as FestivalId,
          storeId: storeId as StoreId,
          type: "festival",
        });
      }
    }
  }
}

function collectQuestRewardSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
): void {
  const quests = fiddle.quests as Record<string, Record<string, unknown>> | undefined;
  if (!quests) return;

  for (const questGroup of Object.values(quests)) {
    if (typeof questGroup !== "object" || questGroup === null) continue;

    for (const [questId, quest] of Object.entries(questGroup)) {
      if (questId === "default" || typeof quest !== "object" || quest === null) continue;

      const questData = quest as Record<string, unknown>;
      const rewards = Array.isArray(questData.rewards) ? questData.rewards : [];

      for (const reward of rewards) {
        if (typeof reward !== "object" || reward === null) continue;
        const itemId = (reward as Record<string, unknown>).item as string | undefined;
        if (itemId) {
          accumulator.add(itemId as ItemId, {
            questId: questId as QuestId,
            trigger: "completion",
            type: "quest",
          });
        }
      }
    }
  }
}

function collectRenownRewardSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
): void {
  const renown = fiddle.renown as Record<string, unknown> | undefined;
  if (!renown) return;

  const rewards = Array.isArray(renown.rewards) ? renown.rewards : [];

  for (let i = 0; i < rewards.length; i++) {
    const reward = rewards[i];
    if (typeof reward !== "object" || reward === null) continue;
    const obj = reward as Record<string, unknown>;
    const targetId = (obj.cosmetic as string) ?? (obj.item as string);
    if (!targetId) continue;

    accumulator.add(targetId as ItemId, {
      level: i + 1,
      type: "renown",
    });
  }
}
