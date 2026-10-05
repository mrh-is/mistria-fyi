import IconArchive from "@tabler/icons-svelte-runes/icons/archive";
import IconBabyCarriage from "@tabler/icons-svelte-runes/icons/baby-carriage";
import IconBook from "@tabler/icons-svelte-runes/icons/book";
import IconBook2 from "@tabler/icons-svelte-runes/icons/book-2";
import IconBug from "@tabler/icons-svelte-runes/icons/bug";
import IconBuildingBank from "@tabler/icons-svelte-runes/icons/building-bank";
import IconChevronRight from "@tabler/icons-svelte-runes/icons/chevron-right";
import IconCircle from "@tabler/icons-svelte-runes/icons/circle";
import IconCircleCheck from "@tabler/icons-svelte-runes/icons/circle-check";
import IconCircleDashed from "@tabler/icons-svelte-runes/icons/circle-dashed";
import IconClock from "@tabler/icons-svelte-runes/icons/clock";
import IconCloudRain from "@tabler/icons-svelte-runes/icons/cloud-rain";
import IconCloudSnow from "@tabler/icons-svelte-runes/icons/cloud-snow";
import IconCloudStorm from "@tabler/icons-svelte-runes/icons/cloud-storm";
import IconCoins from "@tabler/icons-svelte-runes/icons/coins";
import IconConfetti from "@tabler/icons-svelte-runes/icons/confetti";
import IconCrown from "@tabler/icons-svelte-runes/icons/crown";
import IconDiamond from "@tabler/icons-svelte-runes/icons/diamond";
import IconEgg from "@tabler/icons-svelte-runes/icons/egg";
import IconFileText from "@tabler/icons-svelte-runes/icons/file-text";
import IconFish from "@tabler/icons-svelte-runes/icons/fish";
import IconFishHook from "@tabler/icons-svelte-runes/icons/fish-hook";
import IconFlower from "@tabler/icons-svelte-runes/icons/flower";
import IconHeart from "@tabler/icons-svelte-runes/icons/heart";
import IconHelmet from "@tabler/icons-svelte-runes/icons/helmet";
import IconLeaf from "@tabler/icons-svelte-runes/icons/leaf";
import IconLock from "@tabler/icons-svelte-runes/icons/lock";
import IconMail from "@tabler/icons-svelte-runes/icons/mail";
import IconNotebook from "@tabler/icons-svelte-runes/icons/notebook";
import IconOctagon from "@tabler/icons-svelte-runes/icons/octagon";
import IconPaw from "@tabler/icons-svelte-runes/icons/paw";
import IconPick from "@tabler/icons-svelte-runes/icons/pick";
import IconSalad from "@tabler/icons-svelte-runes/icons/salad";
import IconShirt from "@tabler/icons-svelte-runes/icons/shirt";
import IconShoppingCart from "@tabler/icons-svelte-runes/icons/shopping-cart";
import IconShovel from "@tabler/icons-svelte-runes/icons/shovel";
import IconSkull from "@tabler/icons-svelte-runes/icons/skull";
import IconSnowflake from "@tabler/icons-svelte-runes/icons/snowflake";
import IconSparkles from "@tabler/icons-svelte-runes/icons/sparkles";
import IconSpiral from "@tabler/icons-svelte-runes/icons/spiral";
import IconStar from "@tabler/icons-svelte-runes/icons/star";
import IconSun from "@tabler/icons-svelte-runes/icons/sun";
import IconSunLow from "@tabler/icons-svelte-runes/icons/sun-low";
import IconSword from "@tabler/icons-svelte-runes/icons/sword";
import IconToolsKitchen from "@tabler/icons-svelte-runes/icons/tools-kitchen";
import IconToolsKitchen2 from "@tabler/icons-svelte-runes/icons/tools-kitchen-2";
import IconTree from "@tabler/icons-svelte-runes/icons/tree";
import IconTrophy from "@tabler/icons-svelte-runes/icons/trophy";
import IconWheat from "@tabler/icons-svelte-runes/icons/wheat";
import IconWind from "@tabler/icons-svelte-runes/icons/wind";
import IconX from "@tabler/icons-svelte-runes/icons/x";

import type { Icon } from "@tabler/icons-svelte-runes";

import type { CategoryKey } from "#lib/data/categories.js";
import type { SourceFilter } from "#lib/stores/toolbar-state.svelte.js";
import type { Source } from "#lib/types/acquisition.js";
import type { Season, Weather } from "#lib/types/tracker-data.js";
import type { QuestState } from "#lib/types/user-progress.js";

export type AppIcon = Icon;

export interface IconProps {
  [key: string]: unknown;
  class?: string;
  color?: string;
  size?: number | string;
  stroke?: number | string;
}

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
    icon: IconArchive,
    label: "Chests",
    members: ["Beach cave", "Treasure boxes", "Lost & found"],
    types: ["beach_cave_chest", "treasure_chest", "lost_and_found"],
  },
  {
    icon: IconToolsKitchen2,
    label: "Crafting",
    members: ["Recipes"],
    types: ["recipe"],
  },
  {
    icon: IconHeart,
    label: "Dating",
    members: ["Dates", "Engagement", "Proposals", "Spouse gifts", "Wedding"],
    types: ["engagement", "date", "date_inspiration", "proposal", "spouseGift", "wedding"],
  },
  {
    icon: IconWheat,
    label: "Farming",
    members: ["Crops", "Trees", "Animal products", "Breeding", "Stations", "Shipping"],
    types: ["crop", "tree", "animal_product", "breed", "station", "ship_item"],
  },
  {
    icon: IconConfetti,
    label: "Festivals",
    members: ["Shops", "Activities"],
    types: ["festival", "festival_activity"],
  },
  {
    icon: IconFishHook,
    label: "Fishing",
    members: ["Fish", "Fish traps", "Diving", "Bait fish"],
    types: ["fish", "fish_trap", "dive", "bait_fish"],
  },
  {
    icon: IconSalad,
    label: "Gathering",
    members: ["Foraging", "Bug catching", "Artifact digs", "Equipment"],
    types: ["forage", "bug_catch", "artifact_dig", "equipment"],
  },
  {
    icon: IconPick,
    label: "Mines",
    members: ["Mining", "Chests", "Dig sites", "Mine fishing", "Monsters"],
    types: ["mines_chest", "mines_dig_site", "mine", "mine_fish", "monster", "monster_feed"],
  },
  {
    icon: IconBuildingBank,
    label: "Museum",
    members: ["Donations", "Replicator", "Donation rewards"],
    types: ["museum_donation", "artifact_replicator", "donate_item"],
  },
  {
    icon: IconCoins,
    label: "Offerings",
    members: ["Chicken statue", "Wishing well"],
    types: ["chicken_statue", "wishing_well"],
  },
  {
    icon: IconSparkles,
    label: "Perks",
    members: ["Unlocks", "Drops", "Ritual chamber"],
    types: ["perk", "perk_drop", "ritual_chamber"],
  },
  {
    icon: IconShoppingCart,
    label: "Stores",
    members: ["Shops", "Scroll bundles", "Upgrades"],
    types: ["store", "scroll_bundle", "upgrade"],
  },
  {
    icon: IconFileText,
    label: "Progress",
    members: ["Default", "Quests", "Renown", "Letters"],
    types: ["default", "quest", "renown", "reach_day"],
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
  all: IconNotebook,
  almanac: IconBook2,
  animals: IconPaw,
  complete: IconTrophy,
  cosmetics: IconShirt,
  mines: IconPick,
  museum: IconBuildingBank,
  quests: IconFileText,
  recipes: IconToolsKitchen2,
  renown: IconCrown,
  skills: IconBook,
  villagers: IconHeart,
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
