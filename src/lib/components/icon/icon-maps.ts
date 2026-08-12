import {
  Archive,
  BookCheck,
  BookOpenText,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleCheckBig,
  CircleDashed,
  Clock,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Coins,
  CookingPot,
  Crown,
  FishingRod,
  Flame,
  Flower,
  HardHat,
  Heart,
  Landmark,
  Layers,
  Leaf,
  Lock,
  Mail,
  Octagon,
  PartyPopper,
  PawPrint,
  Pickaxe,
  Scroll,
  ScrollText,
  Shirt,
  ShoppingCart,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  SunDim,
  Trophy,
  Wind,
  X,
} from "@lucide/svelte";

export type { LucideIcon, LucideProps } from "@lucide/svelte";

import type { LucideIcon } from "@lucide/svelte";

import type { CategoryKey } from "$lib/data/categories.js";
import type { SourceFilter } from "$lib/stores/toolbar-state.svelte.js";
import type { QuestState } from "$lib/stores/user-state.svelte.js";
import type { RecipeSource, Season, Weather } from "$lib/types/tracker-data.js";

// ── Source ──────────────────────────────────────────────────────────────────

export const SOURCE_ICON: Record<RecipeSource["type"], LucideIcon> = {
  beach_cave_chest: Archive,
  chicken_statue: Coins,
  default: CircleCheck,
  dragon_forge: Flame,
  festival: PartyPopper,
  letter: Mail,
  mines_chest: Pickaxe,
  mines_dig_site: Pickaxe,
  museum_donation: Landmark,
  perk: Sparkles,
  quest: Scroll,
  relationship: Heart,
  renown: Crown,
  scroll_bundle: ShoppingCart,
  store: ShoppingCart,
  store_with_perk: ShoppingCart,
  treasure_chest: FishingRod,
  upgrade: HardHat,
  wishing_well: Coins,
};

export const SOURCE_FILTERS: SourceFilter[] = [
  { icon: Archive, label: "Chest", types: ["beach_cave_chest"] },
  { icon: HardHat, label: "Construction", types: ["upgrade"] },
  { icon: CircleCheck, label: "Default", types: ["default"] },
  { icon: Flame, label: "Dragon Forge", types: ["dragon_forge"] },
  { icon: PartyPopper, label: "Festival", types: ["festival"] },
  { icon: FishingRod, label: "Fishing", types: ["treasure_chest"] },
  { icon: Mail, label: "Letter", types: ["letter"] },
  { icon: Pickaxe, label: "Mines", types: ["mines_chest", "mines_dig_site"] },
  { icon: Landmark, label: "Museum", types: ["museum_donation"] },
  { icon: Coins, label: "Offering", types: ["chicken_statue", "wishing_well"] },
  { icon: Sparkles, label: "Perk", types: ["perk"] },
  { icon: Scroll, label: "Quest", types: ["quest"] },
  { icon: Heart, label: "Relationship", types: ["relationship"] },
  { icon: ShoppingCart, label: "Store", types: ["store", "store_with_perk", "scroll_bundle"] },
  { icon: Crown, label: "Town rank", types: ["renown"] },
];

// ── Season ──────────────────────────────────────────────────────────────────

export const SEASON_ICON: Record<Season, LucideIcon> = {
  fall: Leaf,
  spring: Flower,
  summer: Sun,
  winter: Snowflake,
};

// ── Weather ─────────────────────────────────────────────────────────────────

export function restrictionWeatherIcon(weather: Weather, seasons: Season[]): LucideIcon {
  if (weather === "calm") return SunDim;
  if (weather === "special") return Wind;
  if (weather === "heavy_inclement") return CloudLightning;
  if (seasons.length === 1 && seasons[0] === "winter") return CloudSnow;
  return CloudRain;
}

export function weatherIcon(weather: Weather, season: Season): LucideIcon {
  if (weather === "calm") return SunDim;
  if (weather === "special") return Wind;
  if (weather === "heavy_inclement") return CloudLightning;
  if (season === "winter") return CloudSnow;
  return CloudRain;
}

// ── Category ────────────────────────────────────────────────────────────────

export const CATEGORY_ICON: Record<"all" | "complete" | CategoryKey, LucideIcon> = {
  all: Layers,
  almanac: BookCheck,
  animals: PawPrint,
  complete: Trophy,
  cosmetics: Shirt,
  mines: Pickaxe,
  museum: Landmark,
  npcs: Heart,
  quests: ScrollText,
  recipes: CookingPot,
  renown: Crown,
  skills: BookOpenText,
};

// ── Completion ──────────────────────────────────────────────────────────────

export const COMPLETION_ICON: Record<QuestState, LucideIcon> = {
  completed: CircleCheckBig,
  none: CircleDashed,
  obtained: Circle,
};

// ── Restriction ─────────────────────────────────────────────────────────────

export const RESTRICTION_ICON = {
  clock: Clock,
  lock: Lock,
} as const satisfies Record<string, LucideIcon>;

// ── ProgressMark ────────────────────────────────────────────────────────────

export type ProgressMarkType = "relationship_dateable" | "relationship_platonic" | "town_rank";

export const PROGRESS_MARK_ICON: Record<ProgressMarkType, LucideIcon> = {
  relationship_dateable: Heart,
  relationship_platonic: Octagon,
  town_rank: Star,
};

// ── UI ──────────────────────────────────────────────────────────────────────

export type UIIconType = "disclosure" | "dismiss";

export const UI_ICON: Record<UIIconType, LucideIcon> = {
  disclosure: ChevronRight,
  dismiss: X,
};
