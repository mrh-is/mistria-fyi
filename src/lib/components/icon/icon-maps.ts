import {
  IconArchive,
  IconBabyCarriage,
  IconBook,
  IconBook2,
  IconBug,
  IconBuildingBank,
  IconChevronRight,
  IconCircle,
  IconCircleCheck,
  IconCircleDashed,
  IconClock,
  IconCloudRain,
  IconCloudSnow,
  IconCloudStorm,
  IconCoins,
  IconConfetti,
  IconCrown,
  IconDiamond,
  IconEgg,
  IconFileText,
  IconFish,
  IconFishHook,
  IconFlower,
  IconHeart,
  IconHelmet,
  IconLeaf,
  IconLock,
  IconMail,
  IconOctagon,
  IconPaw,
  IconPick,
  IconSalad,
  IconShirt,
  IconShoppingCart,
  IconShovel,
  IconSkull,
  IconSnowflake,
  IconSparkles,
  IconSpiral,
  IconStack2,
  IconStar,
  IconSun,
  IconSunLow,
  IconSword,
  IconToolsKitchen,
  IconToolsKitchen2,
  IconTree,
  IconTrophy,
  IconWheat,
  IconWind,
  IconX,
} from "@tabler/icons-svelte-runes";

import type { Icon } from "@tabler/icons-svelte-runes";

export type AppIcon = Icon;

export interface IconProps {
  [key: string]: unknown;
  class?: string;
  color?: string;
  size?: number | string;
  stroke?: number | string;
}

import type { CategoryKey } from "$lib/data/categories.js";
import type { SourceFilter } from "$lib/stores/toolbar-state.svelte.js";
import type { QuestState } from "$lib/stores/user-state.svelte.js";
import type { Source } from "$lib/types/acquisition";
import type { Season, Weather } from "$lib/types/tracker-data.js";

// ── Source ──────────────────────────────────────────────────────────────────

export const SOURCE_ICON: Record<Source["type"], Icon> = {
  // Types from item/cosmetic acquisition sources only
  animal_product: IconEgg,
  artifact_dig: IconShovel,
  artifact_replicator: IconDiamond,
  bait_fish: IconFish,
  // Shared types (present in both old recipe sources and item/cosmetic sources)
  beach_cave_chest: IconArchive,
  breed: IconBabyCarriage,
  bug_catch: IconBug,
  chicken_statue: IconCoins,
  crop: IconWheat,
  date: IconHeart,
  date_inspiration: IconHeart,
  default: IconCircleCheck,
  dive: IconSpiral,
  donate_item: IconMail,
  engagement: IconHeart,
  equipment: IconSword,
  festival: IconConfetti,
  festival_activity: IconConfetti,
  fish: IconFish,
  fish_trap: IconFishHook,
  forage: IconSalad,
  lost_and_found: IconArchive,
  mine: IconPick,
  mine_fish: IconFish,
  mines_chest: IconPick,
  mines_dig_site: IconPick,
  monster: IconSkull,
  monster_feed: IconToolsKitchen,
  museum_donation: IconBuildingBank,
  perk: IconSparkles,
  perk_drop: IconSparkles,
  proposal: IconHeart,
  quest: IconFileText,
  reach_day: IconMail,
  recipe: IconToolsKitchen2,
  renown: IconCrown,
  ritual_chamber: IconSparkles,
  scroll_bundle: IconShoppingCart,
  ship_item: IconMail,
  spouseGift: IconHeart,
  station: IconHelmet,
  store: IconShoppingCart,
  treasure_chest: IconFishHook,
  tree: IconTree,
  upgrade: IconHelmet,
  wedding: IconHeart,
  wishing_well: IconCoins,
};

export const SOURCE_FILTERS: SourceFilter[] = [
  {
    icon: IconWheat,
    label: "Foraging",
    members: ["Crops", "trees", "animals", "ground finds", "mines", "monsters", "chests"],
    types: [
      "animal_product",
      "artifact_dig",
      "beach_cave_chest",
      "breed",
      "bug_catch",
      "chicken_statue",
      "crop",
      "default",
      "forage",
      "lost_and_found",
      "mine",
      "mines_chest",
      "mines_dig_site",
      "monster",
      "monster_feed",
      "treasure_chest",
      "tree",
      "wishing_well",
    ],
  },
  {
    icon: IconFishHook,
    label: "Fishing",
    members: ["Rod catches", "fish traps", "diving", "bait fish", "mine fishing"],
    types: ["bait_fish", "dive", "fish", "fish_trap", "mine_fish"],
  },
  {
    icon: IconShoppingCart,
    label: "Shops",
    members: ["Store inventories", "scroll bundles", "upgrades"],
    types: ["scroll_bundle", "store", "upgrade"],
  },
  {
    icon: IconHeart,
    label: "NPCs",
    members: ["Gifts", "dates", "relationships", "quests", "letters", "renown"],
    types: [
      "date",
      "date_inspiration",
      "donate_item",
      "engagement",
      "proposal",
      "quest",
      "reach_day",
      "renown",
      "spouseGift",
      "wedding",
    ],
  },
  {
    icon: IconConfetti,
    label: "Events",
    members: ["Festivals", "seasonal activities"],
    types: ["festival", "festival_activity"],
  },
  {
    icon: IconToolsKitchen2,
    label: "Crafting",
    members: ["Recipes", "stations", "equipment", "perks", "museum rewards", "shipping"],
    types: [
      "artifact_replicator",
      "equipment",
      "museum_donation",
      "perk",
      "perk_drop",
      "recipe",
      "ritual_chamber",
      "ship_item",
      "station",
    ],
  },
];

// ── Season ──────────────────────────────────────────────────────────────────

export const SEASON_ICON: Record<Season, Icon> = {
  fall: IconLeaf,
  spring: IconFlower,
  summer: IconSun,
  winter: IconSnowflake,
};

// ── Weather ─────────────────────────────────────────────────────────────────

export function restrictionWeatherIcon(weather: Weather, seasons: Season[]): Icon {
  if (weather === "calm") return IconSunLow;
  if (weather === "special") return IconWind;
  if (weather === "heavy_inclement") return IconCloudStorm;
  if (seasons.length === 1 && seasons[0] === "winter") return IconCloudSnow;
  return IconCloudRain;
}

export function weatherIcon(weather: Weather, season: Season): Icon {
  if (weather === "calm") return IconSunLow;
  if (weather === "special") return IconWind;
  if (weather === "heavy_inclement") return IconCloudStorm;
  if (season === "winter") return IconCloudSnow;
  return IconCloudRain;
}

// ── Category ────────────────────────────────────────────────────────────────

export const CATEGORY_ICON: Record<"all" | "complete" | CategoryKey, Icon> = {
  all: IconStack2,
  almanac: IconBook2,
  animals: IconPaw,
  complete: IconTrophy,
  cosmetics: IconShirt,
  mines: IconPick,
  museum: IconBuildingBank,
  npcs: IconHeart,
  quests: IconFileText,
  recipes: IconToolsKitchen2,
  renown: IconCrown,
  skills: IconBook,
};

// ── Completion ──────────────────────────────────────────────────────────────

export const COMPLETION_ICON: Record<QuestState, Icon> = {
  completed: IconCircleCheck,
  none: IconCircleDashed,
  obtained: IconCircle,
};

// ── Restriction ─────────────────────────────────────────────────────────────

export const RESTRICTION_ICON = {
  clock: IconClock,
  lock: IconLock,
} as const satisfies Record<string, Icon>;

// ── ProgressMark ────────────────────────────────────────────────────────────

export type ProgressMarkType = "relationship_dateable" | "relationship_platonic" | "town_rank";

export const PROGRESS_MARK_ICON: Record<ProgressMarkType, Icon> = {
  relationship_dateable: IconHeart,
  relationship_platonic: IconOctagon,
  town_rank: IconStar,
};

// ── UI ──────────────────────────────────────────────────────────────────────

export type UIIconType = "disclosure" | "dismiss";

export const UI_ICON: Record<UIIconType, Icon> = {
  disclosure: IconChevronRight,
  dismiss: IconX,
};
