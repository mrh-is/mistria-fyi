import { expect } from "@playwright/test";

import { THEME_STORAGE_KEY } from "../../../src/lib/theme.js";
import { legacyAvailabilityWindows } from "../../../src/lib/types/availability.js";
import { CURRENT_SERIALIZATION_VERSION } from "../../../src/lib/types/user-progress.js";

import type { Page, Response } from "@playwright/test";

import type { SerializedState } from "../../../src/lib/stores/user-state.svelte.js";
import type {
  AvailabilityWindow,
  LegacyAvailabilityMode,
} from "../../../src/lib/types/availability.js";
import type { AccessibilityTheme } from "./violations.js";

/** Legacy fields the store reads for migration but never writes. */
type LegacyCompletedKey =
  | "marriedVillager"
  | "quests"
  | "romanticVillagers"
  | "skills"
  | "villagers";

/** Every field the store writes today, so a fixture never exercises the legacy migration path. */
type SerializedCompletedState = Omit<Required<SerializedState["completed"]>, LegacyCompletedKey>;

interface StoredState extends Omit<SerializedState, "availabilityMode" | "completed"> {
  availabilityWindows: AvailabilityWindow[];
  completed: SerializedCompletedState;
  showSpoilers: boolean;
}

/**
 * Builds a blob in the store's current serialized shape (`SerializedState`) and version.
 * `availabilityMode` is shorthand for the equivalent `availabilityWindows`.
 */
export function createStoredState(
  overrides: Partial<Omit<StoredState, "completed" | "version">> & {
    availabilityMode?: LegacyAvailabilityMode;
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
    availabilityWindows:
      overrides.availabilityWindows ??
      legacyAvailabilityWindows(overrides.availabilityMode ?? "available"),
    completed,
    showSpoilers: overrides.showSpoilers ?? false,
    version: CURRENT_SERIALIZATION_VERSION,
    worldState: overrides.worldState ?? { season: "spring", weather: "calm" },
  };
}

export async function expectResolvedTheme(page: Page, theme: AccessibilityTheme): Promise<void> {
  // oxlint-disable-next-line playwright/no-raw-locators -- the theme class lives on the document element, which has no role
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
}

/** Selector for the marker the root layout stamps once the client has hydrated. */
export const HYDRATED_SELECTOR = 'html[data-hydrated="true"]';

/**
 * Navigates and waits for interaction readiness. A control clicked between
 * the server-rendered paint and `onMount` drops the event, which showed up as flaky interaction
 * failures under parallel workers (#330).
 */
export async function gotoApplication(page: Page, path: string): Promise<null | Response> {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.locator(HYDRATED_SELECTOR).waitFor({ state: "attached" });
  return response;
}

export async function gotoRenderedApplication(page: Page, path: string): Promise<null | Response> {
  const response = await gotoApplication(page, path);
  await waitForRendering(page);
  return response;
}

/** Asset/layout readiness for geometry and contrast checks, including newly expanded content. */
export async function waitForRendering(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Let hydration and state changes reach the next painted frame before inspecting animations.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
  await page.waitForFunction(() =>
    [...document.images].every((image) => {
      const box = image.getBoundingClientRect();
      // Below-the-fold lazy images have not been requested yet. Broken images are settled too;
      // their application fallback and the existing assertions determine whether they are valid.
      const inViewport =
        box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
      return (
        image.complete ||
        box.width === 0 ||
        box.height === 0 ||
        (image.loading === "lazy" && !inViewport)
      );
    }),
  );
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => {
      const iterations = animation.effect?.getComputedTiming().iterations;
      return iterations === Infinity || animation.playState === "finished";
    }),
  );
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
