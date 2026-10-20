import { getName } from "#lib/data/names.js";
import * as m from "#lib/paraglide/messages.js";

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
    types: ["mines_chest", "mines_dig_site", "mine", "mine_fish", "monster", "monster_feed"],
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
  chests: (locale) => m.source_filter_chests({}, { locale }),
  crafting: (locale) => m.source_filter_crafting({}, { locale }),
  dating: (locale) => m.source_filter_dating({}, { locale }),
  farming: (locale) => m.source_filter_farming({}, { locale }),
  festivals: (locale) => m.source_filter_festivals({}, { locale }),
  fishing: (locale) => m.source_filter_fishing({}, { locale }),
  gathering: (locale) => m.source_filter_gathering({}, { locale }),
  mines: (locale) => m.category_mines_name({}, { locale }),
  museum: (locale) => getName("ui", "museum", locale),
  offerings: (locale) => m.source_filter_offerings({}, { locale }),
  perks: (locale) => m.source_filter_perks({}, { locale }),
  progress: (locale) => m.source_filter_progress({}, { locale }),
  stores: (locale) => m.source_filter_stores({}, { locale }),
};

const MEMBER_LABELS: Record<SourceFilterMemberId, LabelResolver> = {
  activities: (locale) => m.source_filter_member_activities({}, { locale }),
  animal_products: (locale) => m.source_filter_member_animal_products({}, { locale }),
  artifact_digs: (locale) => m.source_filter_member_artifact_digs({}, { locale }),
  bait_fish: (locale) => m.source_filter_member_bait_fish({}, { locale }),
  breeding: (locale) => m.source_filter_member_breeding({}, { locale }),
  bug_catching: (locale) => m.source_filter_member_bug_catching({}, { locale }),
  chests: (locale) => m.source_filter_member_chests({}, { locale }),
  chicken_statue: (locale) => m.source_filter_member_chicken_statue({}, { locale }),
  crops: (locale) => getName("ui", "crops", locale),
  dates: (locale) => m.source_filter_member_dates({}, { locale }),
  default: (locale) => m.source_filter_member_default({}, { locale }),
  dig_sites: (locale) => m.source_filter_member_dig_sites({}, { locale }),
  diving: (locale) => m.source_filter_member_diving({}, { locale }),
  donation_rewards: (locale) => m.source_filter_member_donation_rewards({}, { locale }),
  donations: (locale) => m.source_filter_member_donations({}, { locale }),
  drops: (locale) => m.source_filter_member_drops({}, { locale }),
  engagement: (locale) => m.source_filter_member_engagement({}, { locale }),
  equipment: (locale) => m.source_filter_member_equipment({}, { locale }),
  fish: (locale) => m.source_filter_member_fish({}, { locale }),
  fish_traps: (locale) => m.source_filter_member_fish_traps({}, { locale }),
  foraging: (locale) => m.source_filter_member_foraging({}, { locale }),
  horse_statue: (locale) => m.source_filter_member_horse_statue({}, { locale }),
  letters: (locale) => m.source_filter_member_letters({}, { locale }),
  lost_and_found: (locale) => m.source_filter_member_lost_and_found({}, { locale }),
  mine_fishing: (locale) => m.source_filter_member_mine_fishing({}, { locale }),
  mining: (locale) => m.source_filter_member_mining({}, { locale }),
  monsters: (locale) => m.source_filter_member_monsters({}, { locale }),
  proposals: (locale) => m.source_filter_member_proposals({}, { locale }),
  quests: (locale) => m.category_quests_name({}, { locale }),
  recipes: (locale) => m.category_recipes_name({}, { locale }),
  renown: (locale) => getName("ui", "renown", locale),
  replicator: (locale) => m.source_filter_member_replicator({}, { locale }),
  ritual_chamber: (locale) => m.source_filter_member_ritual_chamber({}, { locale }),
  scroll_bundles: (locale) => m.source_filter_member_scroll_bundles({}, { locale }),
  secret_chests: (locale) => m.source_filter_member_secret_chests({}, { locale }),
  shipping: (locale) => m.source_filter_member_shipping({}, { locale }),
  shops: (locale) => m.source_filter_member_shops({}, { locale }),
  spouse_gifts: (locale) => m.source_filter_member_spouse_gifts({}, { locale }),
  stations: (locale) => m.source_filter_member_stations({}, { locale }),
  treasure_boxes: (locale) => m.source_filter_member_treasure_boxes({}, { locale }),
  trees: (locale) => m.source_filter_member_trees({}, { locale }),
  unlocks: (locale) => m.source_filter_member_unlocks({}, { locale }),
  upgrades: (locale) => m.source_filter_member_upgrades({}, { locale }),
  wedding: (locale) => m.source_filter_member_wedding({}, { locale }),
  wishing_well: (locale) => m.source_filter_member_wishing_well({}, { locale }),
};

export function sourceFilterLabel(id: SourceFilterId, locale: LocaleCode): string {
  return FILTER_LABELS[id](locale);
}

/** The filter's member source kinds as one list, joined in the locale's own style. */
export function sourceFilterMembersLabel(filter: SourceFilter, locale: LocaleCode): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(
    filter.members.map((member) => MEMBER_LABELS[member](locale)),
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
