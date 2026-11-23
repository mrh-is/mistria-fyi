import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { getRenownPresentation } from "#lib/presentation/renown-presentation.js";
import { formatNumber } from "#lib/utils/format.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { ItemId, TreasureChestTierId } from "#lib/types/tracker-data.js";

export interface RenownRewardDisplay {
  amount?: string;
  chest: boolean;
  label: string;
  level: number;
  sprite?: string;
}

function itemName(itemId: ItemId, locale: LocaleCode): string {
  // Fishing chests have their own name chunk, shared with the source ledgers.
  if (itemId.startsWith("treasure_box_")) {
    const tier = itemId.slice("treasure_box_".length) as TreasureChestTierId;
    return getName("treasure-chest-tiers", tier, locale);
  }
  return getName("items", itemId, locale);
}

export function renownRewards(locale: LocaleCode): RenownRewardDisplay[] {
  const { rewards, townRanks } = trackerData.renown;
  return rewards.map((reward, index) => {
    const level = index + 1;
    const printed = formatNumber(level, locale);
    const rank = getName(
      "town-ranks",
      String(getRenownPresentation(level, townRanks).currentRankIndex),
      locale,
    );
    const amount = reward.type === "money" ? formatNumber(reward.amount, locale) : undefined;
    const chest = reward.type === "item" && reward.itemId.startsWith("treasure_box_");
    let name: string;
    switch (reward.type) {
      case "item":
        name = itemName(reward.itemId, locale);
        break;
      case "cosmetic":
        name = getName("cosmetics", reward.cosmeticId, locale);
        break;
      case "money":
        name = `${amount} Tesserae`;
        break;
    }
    return {
      amount,
      chest,
      label: `Level ${printed}, ${rank}: ${name}`,
      level,
      sprite: reward.type === "item" && !chest ? reward.itemId : undefined,
    };
  });
}
