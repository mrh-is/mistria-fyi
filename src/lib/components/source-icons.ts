import {
  Archive,
  CircleCheck,
  Coins,
  Crown,
  FishingHook,
  Flame,
  HardHat,
  Heart,
  Landmark,
  Mail,
  PartyPopper,
  Pickaxe,
  Scroll,
  ShoppingCart,
  Sparkles,
} from "@lucide/svelte";

import type { Component } from "svelte";

import type { SourceFilter } from "$lib/stores/toolbar-state.svelte.js";
import type { RecipeSource } from "$lib/types/tracker-data.js";

export const SOURCE_ICON: Record<RecipeSource["type"], Component> = {
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
  treasure_chest: FishingHook,
  upgrade: HardHat,
  wishing_well: Coins,
};

export const SOURCE_FILTERS: SourceFilter[] = [
  { icon: Archive, label: "Chest", types: ["beach_cave_chest"] },
  { icon: HardHat, label: "Construction", types: ["upgrade"] },
  { icon: CircleCheck, label: "Default", types: ["default"] },
  { icon: Flame, label: "Dragon Forge", types: ["dragon_forge"] },
  { icon: PartyPopper, label: "Festival", types: ["festival"] },
  { icon: FishingHook, label: "Fishing", types: ["treasure_chest"] },
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
