import {
  Archive,
  Baby,
  BookCheck,
  BookOpenText,
  Bug,
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
  Egg,
  Fish,
  FishingRod,
  Flower,
  Gem,
  HandPlatter,
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
  Salad,
  Scroll,
  ScrollText,
  Shell,
  Shirt,
  ShoppingCart,
  Shovel,
  Skull,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  SunDim,
  Sword,
  TreePine,
  Trophy,
  Wheat,
  Wind,
  X,
} from "@lucide/svelte";

export type { LucideIcon, LucideProps } from "@lucide/svelte";

import type { LucideIcon } from "@lucide/svelte";

import type { CategoryKey } from "$lib/data/categories.js";
import type { SourceFilter } from "$lib/stores/toolbar-state.svelte.js";
import type { QuestState } from "$lib/stores/user-state.svelte.js";
import type { AcquisitionSource, Season, Weather } from "$lib/types/tracker-data.js";

// ── Source ──────────────────────────────────────────────────────────────────

export const SOURCE_ICON: Record<AcquisitionSource["type"], LucideIcon> = {
  // Types from item/cosmetic acquisition sources only
  animal_product: Egg,
  artifact_dig: Shovel,
  artifact_replicator: Gem,
  // Shared types (present in both old recipe sources and item/cosmetic sources)
  beach_cave_chest: Archive,
  breed: Baby,
  bug_catch: Bug,
  chicken_statue: Coins,
  crop: Wheat,
  date: Heart,
  default: CircleCheck,
  dive: Shell,
  engagement: Heart,
  equipment: Sword,
  festival: PartyPopper,
  festival_activity: PartyPopper,
  fish: Fish,
  fish_trap: FishingRod,
  forage: Salad,
  letter: Mail,
  mine: Pickaxe,
  mines_chest: Pickaxe,
  mines_dig_site: Pickaxe,
  monster: Skull,
  monster_feed: HandPlatter,
  museum_donation: Landmark,
  perk: Sparkles,
  perk_drop: Sparkles,
  proposal: Heart,
  quest: Scroll,
  recipe: CookingPot,
  renown: Crown,
  ritual_chamber: Sparkles,
  scroll_bundle: ShoppingCart,
  station: HardHat,
  store: ShoppingCart,
  treasure_chest: FishingRod,
  tree: TreePine,
  upgrade: HardHat,
  wedding: Heart,
  wishing_well: Coins,
};

export const SOURCE_FILTERS: SourceFilter[] = [
  { icon: Archive, label: "Chest", types: ["beach_cave_chest", "treasure_chest"] },
  { icon: HardHat, label: "Construction", types: ["upgrade", "station"] },
  { icon: CircleCheck, label: "Default", types: ["default"] },
  { icon: Heart, label: "Dating", types: ["engagement", "date", "proposal", "wedding"] },
  {
    icon: Salad,
    label: "Gathering",
    types: ["forage", "bug_catch", "artifact_dig", "animal_product"],
  },
  { icon: PartyPopper, label: "Festival", types: ["festival", "festival_activity"] },
  {
    icon: FishingRod,
    label: "Fishing",
    types: ["fish", "fish_trap", "dive"],
  },
  { icon: Wheat, label: "Farming", types: ["crop", "tree"] },
  { icon: Mail, label: "Letter", types: ["letter"] },
  { icon: Pickaxe, label: "Mines", types: ["mines_chest", "mines_dig_site", "mine"] },
  { icon: Skull, label: "Monster", types: ["monster", "monster_feed"] },
  { icon: Landmark, label: "Museum", types: ["museum_donation", "artifact_replicator"] },
  { icon: Coins, label: "Offering", types: ["chicken_statue", "wishing_well"] },
  { icon: Sparkles, label: "Perk", types: ["perk", "perk_drop", "ritual_chamber"] },
  { icon: Scroll, label: "Quest", types: ["quest"] },
  { icon: CookingPot, label: "Recipe", types: ["recipe"] },
  { icon: Sword, label: "Equipment", types: ["equipment"] },
  { icon: ShoppingCart, label: "Store", types: ["store", "scroll_bundle"] },
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
