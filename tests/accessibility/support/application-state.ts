import { expect } from "@playwright/test";

import type { Page, Response } from "@playwright/test";

import type { AccessibilityTheme } from "./violations.js";

interface SerializedCompletedState {
  almanac: string[];
  almanacRecipes: string[];
  animalCosmetics: Record<string, string[]>;
  animals: Record<string, string[]>;
  childChoice: "no" | "undeclared" | "yes";
  cosmetics: string[];
  dates: string[];
  hasUpperFloor: boolean;
  mines: { floor: number; spells: string[] };
  museum: string[];
  petCosmetics: string[];
  petSkins: string[];
  questStates: Record<string, "completed" | "none" | "obtained">;
  reachedSeason: "fall" | "spring" | "summer" | "winter";
  renown: number;
  skillLevels: Record<string, number>;
  unlockedPerks: string[];
  villagerLevels: Record<string, number>;
  villagerRelationships: Record<string, string>;
}

interface StoredState {
  availabilityMode: "available" | "everything" | "timely";
  completed: SerializedCompletedState;
  showSpoilers: boolean;
  version: "1";
  worldState: {
    season: "fall" | "spring" | "summer" | "winter";
    weather: "calm" | "heavy_inclement" | "inclement" | "special";
  };
}

export function createStoredState(
  overrides: Partial<Omit<StoredState, "completed" | "version">> & {
    completed?: Partial<SerializedCompletedState>;
  } = {},
): StoredState {
  const completed: SerializedCompletedState = {
    almanac: [],
    almanacRecipes: [],
    animalCosmetics: {},
    animals: {},
    childChoice: "undeclared",
    cosmetics: [],
    dates: [],
    hasUpperFloor: false,
    mines: { floor: 0, spells: [] },
    museum: [],
    petCosmetics: [],
    petSkins: [],
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    skillLevels: {},
    unlockedPerks: [],
    villagerLevels: {},
    villagerRelationships: {},
    ...overrides.completed,
  };

  return {
    availabilityMode: overrides.availabilityMode ?? "available",
    completed,
    showSpoilers: overrides.showSpoilers ?? false,
    version: "1",
    worldState: overrides.worldState ?? { season: "spring", weather: "calm" },
  };
}

export async function expectResolvedTheme(page: Page, theme: AccessibilityTheme): Promise<void> {
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
}

export async function gotoApplication(page: Page, path: string): Promise<null | Response> {
  return page.goto(path, { waitUntil: "networkidle" });
}

export async function initializeApplication(
  page: Page,
  theme: AccessibilityTheme,
  state: null | StoredState = null,
): Promise<void> {
  await page.addInitScript(
    ({ serializedState, themePreference }) => {
      localStorage.clear();
      localStorage.setItem("mistria-fyi-theme", themePreference);
      if (serializedState !== null) localStorage.setItem("mistria-fyi-v1", serializedState);
    },
    { serializedState: state ? JSON.stringify(state) : null, themePreference: theme },
  );
}
