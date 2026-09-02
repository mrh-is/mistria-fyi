import { expect } from "@playwright/test";

import type { Page } from "@playwright/test";

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
  npcLevels: Record<string, number>;
  npcRelationships: Record<string, string>;
  petCosmetics: string[];
  petSkins: string[];
  questStates: Record<string, "completed" | "none" | "obtained">;
  reachedSeason: "fall" | "spring" | "summer" | "winter";
  renown: number;
  skillLevels: Record<string, number>;
  unlockedPerks: string[];
}

interface StoredState {
  availabilityMode: "accessible" | "all" | "seasonal";
  completed: SerializedCompletedState;
  showSpoilers: boolean;
  version: "1";
  worldState: {
    season: "fall" | "spring" | "summer" | "winter";
    weather: "rainy" | "snowy" | "sunny";
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
    npcLevels: {},
    npcRelationships: {},
    petCosmetics: [],
    petSkins: [],
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    skillLevels: {},
    unlockedPerks: [],
    ...overrides.completed,
  };

  return {
    availabilityMode: overrides.availabilityMode ?? "accessible",
    completed,
    showSpoilers: overrides.showSpoilers ?? false,
    version: "1",
    worldState: overrides.worldState ?? { season: "spring", weather: "sunny" },
  };
}

export async function expectResolvedTheme(page: Page, theme: AccessibilityTheme): Promise<void> {
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
}

export async function initializeApplication(
  page: Page,
  theme: AccessibilityTheme,
  state: StoredState = createStoredState(),
): Promise<void> {
  await page.addInitScript(
    ({ serializedState, themePreference }) => {
      localStorage.clear();
      localStorage.setItem("mistria-fyi-theme", themePreference);
      localStorage.setItem("mistria-fyi-v1", serializedState);
    },
    { serializedState: JSON.stringify(state), themePreference: theme },
  );
}
