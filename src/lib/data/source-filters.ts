import { getName } from "#lib/data/names.js";
import { inLocale } from "#lib/i18n/locale-runtime.js";

import type { Source } from "#lib/types/acquisition.js";
import type { LocaleCode } from "#lib/types/locale.js";

export type SourceFilterId =
  | "chests"
  | "crafting"
  | "dating"
  | "farming"
  | "festivals"
  | "fishing"
  | "gathering"
  | "mines"
  | "museum"
  | "offerings"
  | "perks"
  | "progress"
  | "stores";

type SourceFilterMemberId =
  | "activities"
  | "animal_products"
  | "artifact_digs"
  | "bait_fish"
  | "breeding"
  | "bug_catching"
  | "chests"
  | "chicken_statue"
  | "crops"
  | "dates"
  | "default"
  | "dig_sites"
  | "diving"
  | "donation_rewards"
  | "donations"
  | "drops"
  | "engagement"
  | "equipment"
  | "fish"
  | "fish_traps"
  | "foraging"
  | "horse_statue"
  | "letters"
  | "lost_and_found"
  | "mine_fishing"
  | "mining"
  | "monsters"
  | "proposals"
  | "quests"
  | "recipes"
  | "renown"
  | "replicator"
  | "ritual_chamber"
  | "scroll_bundles"
  | "secret_chests"
  | "shipping"
  | "shops"
  | "spouse_gifts"
  | "stations"
  | "treasure_boxes"
  | "trees"
  | "unlocks"
  | "upgrades"
  | "wedding"
  | "wishing_well";

/**
 * A group of source types the visibility panel toggles together. `id` is the stable identity the
 * toolbar state keys on; labels resolve per locale through {@link sourceFilterLabel}.
 */
export interface SourceFilter {
  readonly id: SourceFilterId;
  readonly members: readonly SourceFilterMemberId[];
  readonly types: readonly Source["type"][];
}

export const SOURCE_FILTERS: readonly SourceFilter[] = [
  {
    id: "chests",
    members: ["secret_chests", "treasure_boxes", "lost_and_found"],
    types: ["secret_chest", "treasure_chest", "lost_and_found"],
  },
  { id: "crafting", members: ["recipes"], types: ["recipe"] },
  {
    id: "dating",
    members: ["dates", "engagement", "proposals", "spouse_gifts", "wedding"],
    types: [
      "engagement",
      "date",
      "date_inspiration",
      "date_inspiration_drop",
      "proposal",
      "spouseGift",
      "wedding",
    ],
  },
  {
    id: "farming",
    members: ["crops", "trees", "animal_products", "breeding", "stations", "shipping"],
    types: ["crop", "tree", "animal_product", "breed", "station", "ship_item"],
  },
  { id: "festivals", members: ["shops", "activities"], types: ["festival", "festival_activity"] },
  {
    id: "fishing",
    members: ["fish", "fish_traps", "diving", "bait_fish"],
    types: ["fish", "fish_trap", "dive", "bait_fish"],
  },
  {
    id: "gathering",
    members: ["foraging", "bug_catching", "artifact_digs", "equipment"],
    types: ["forage", "bug_catch", "artifact_dig", "equipment"],
  },
  {
    id: "mines",
    members: ["mining", "chests", "dig_sites", "mine_fishing", "monsters"],
    types: [
      "mines_chest",
      "mines_dig_site",
      "mine",
      "mine_fish",
      "mine_floor",
      "monster",
      "monster_feed",
    ],
  },
  {
    id: "museum",
    members: ["donations", "replicator", "donation_rewards"],
    types: ["museum_donation", "artifact_replicator", "donate_item"],
  },
  {
    id: "offerings",
    members: ["chicken_statue", "horse_statue", "wishing_well"],
    types: ["chicken_statue", "horse_statue", "wishing_well"],
  },
  {
    id: "perks",
    members: ["unlocks", "drops", "ritual_chamber"],
    types: ["perk", "perk_drop", "ritual_chamber"],
  },
  {
    id: "stores",
    members: ["shops", "scroll_bundles", "upgrades"],
    types: ["store", "scroll_bundle", "upgrade"],
  },
  {
    id: "progress",
    members: ["default", "quests", "renown", "letters"],
    types: ["cutscene", "default", "letter", "quest", "renown", "reach_day"],
  },
];

type LabelResolver = (locale: LocaleCode) => string;

/**
 * Labels the game or a category page already names reuse that word (the `ui` chunk or the
 * category message), so a filter chip and the page it points at agree.
 */
const FILTER_LABELS: Record<SourceFilterId, LabelResolver> = {
  chests: () => "Chests",
  crafting: () => "Crafting",
  dating: () => "Dating",
  farming: () => "Farming",
  festivals: () => "Festivals",
  fishing: () => "Fishing",
  gathering: () => "Gathering",
  mines: () => "Mines",
  museum: (locale) => getName("ui", "museum", locale),
  offerings: () => "Offerings",
  perks: () => "Perks",
  progress: () => /* @wc-context: source filter progress */ "Progress",
  stores: () => "Stores",
};

const MEMBER_LABELS: Record<SourceFilterMemberId, LabelResolver> = {
  activities: () => "Activities",
  animal_products: () => "Animal products",
  artifact_digs: () => "Artifact digs",
  bait_fish: () => "Bait fish",
  breeding: () => "Breeding",
  bug_catching: () => "Bug catching",
  chests: () => "Chests",
  chicken_statue: () => "Chicken statue",
  crops: (locale) => getName("ui", "crops", locale),
  dates: () => "Dates",
  default: () => "Default",
  dig_sites: () => "Dig sites",
  diving: () => "Diving",
  donation_rewards: () => "Donation rewards",
  donations: () => "Donations",
  drops: () => "Drops",
  engagement: () => "Engagement",
  equipment: () => "Equipment",
  fish: () => "Fish",
  fish_traps: () => "Fish traps",
  foraging: () => "Foraging",
  horse_statue: () => "Horse statue",
  letters: () => "Letters",
  lost_and_found: () => "Lost & found",
  mine_fishing: () => "Mine fishing",
  mining: () => "Mining",
  monsters: () => "Monsters",
  proposals: () => "Proposals",
  quests: () => "Quests",
  recipes: () => "Recipes",
  renown: (locale) => getName("ui", "renown", locale),
  replicator: () => "Replicator",
  ritual_chamber: () => "Ritual chamber",
  scroll_bundles: () => "Scroll bundles",
  secret_chests: () => "Hidden chests",
  shipping: () => "Shipping",
  shops: () => "Shops",
  spouse_gifts: () => "Spouse gifts",
  stations: () => "Stations",
  treasure_boxes: () => "Treasure boxes",
  trees: () => "Trees",
  unlocks: () => "Unlocks",
  upgrades: () => "Upgrades",
  wedding: () => "Wedding",
  wishing_well: () => "Wishing well",
};

export function sourceFilterLabel(id: SourceFilterId, locale: LocaleCode): string {
  return inLocale(locale, () => FILTER_LABELS[id](locale));
}

/** The filter's member source kinds as one list, joined in the locale's own style. */
export function sourceFilterMembersLabel(filter: SourceFilter, locale: LocaleCode): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(
    inLocale(locale, () => filter.members.map((member) => MEMBER_LABELS[member](locale))),
  );
}

/** Filters in the order of their labels in `locale`; display order only, never identity. */
export function sortSourceFiltersByLabel(
  filters: readonly SourceFilter[],
  locale: LocaleCode,
): SourceFilter[] {
  return filters.toSorted((left, right) => {
    const labelOrder = sourceFilterLabel(left.id, locale).localeCompare(
      sourceFilterLabel(right.id, locale),
      locale,
    );
    return labelOrder === 0 ? left.id.localeCompare(right.id) : labelOrder;
  });
}
