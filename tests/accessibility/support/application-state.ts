import { expect } from "@playwright/test";

import { THEME_STORAGE_KEY } from "../../../src/lib/theme.js";

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

/** Selector for the marker the root layout stamps once the client has hydrated. */
export const HYDRATED_SELECTOR = 'html[data-hydrated="true"]';

/**
 * Navigates and waits for hydration. Network idle alone is not enough: a control clicked between
 * the server-rendered paint and `onMount` drops the event, which showed up as flaky interaction
 * failures under parallel workers (#330).
 */
export async function gotoApplication(page: Page, path: string): Promise<null | Response> {
  const response = await page.goto(path, { waitUntil: "networkidle" });
  await page.locator(HYDRATED_SELECTOR).waitFor({ state: "attached" });
  return response;
}

export async function initializeApplication(
  page: Page,
  theme: AccessibilityTheme,
  state: null | StoredState = null,
): Promise<void> {
  await page.addInitScript(
    ({ serializedState, themeKey, themePreference }) => {
      localStorage.clear();
      localStorage.setItem(themeKey, themePreference);
      if (serializedState !== null) localStorage.setItem("mistria-fyi-v1", serializedState);
    },
    {
      serializedState: state ? JSON.stringify(state) : null,
      themeKey: THEME_STORAGE_KEY,
      themePreference: theme,
    },
  );
}
