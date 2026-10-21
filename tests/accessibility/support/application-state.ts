import { expect } from "@playwright/test";

import {
  PREFERENCES_STORAGE_KEY,
  PROGRESS_STORAGE_KEY,
} from "../../../src/lib/stores/storage-keys.js";
import { THEME_STORAGE_KEY } from "../../../src/lib/theme.js";
import { DEFAULT_AVAILABILITY_WINDOWS } from "../../../src/lib/types/availability.js";
import { CURRENT_SERIALIZATION_VERSION } from "../../../src/lib/types/user-progress.js";

import type { Page, Response } from "@playwright/test";

import type { SerializedState } from "../../../src/lib/stores/progress-storage.js";
import type { SerializedPreferences } from "../../../src/lib/stores/user-state.svelte.js";
import type { AccessibilityTheme } from "./violations.js";

/** Every progress field the store writes; `lastSavePlaytime` only once a save was applied. */
type SerializedProgress = Omit<Required<SerializedState["progress"]>, "lastSavePlaytime">;

/** The two localStorage blobs the store reads at startup: progress and this device's preferences. */
export interface StoredState {
  preferences: SerializedPreferences;
  progress: SerializedState;
}

/** Builds progress & preferences blobs in the store's current serialized shapes and version. */
export function createStoredState(
  overrides: Partial<SerializedPreferences> & {
    progress?: Partial<SerializedProgress>;
    worldState?: SerializedState["worldState"];
  } = {},
): StoredState {
  const progress: SerializedProgress = {
    almanac: [],
    almanacRecipes: [],
    animalCosmetics: {},
    animals: {},
    childChoice: "undeclared",
    cosmetics: [],
    dates: [],
    hasUpperFloor: false,
    heartLevels: {},
    mineFloor: 0,
    mountAppearances: [],
    museum: [],
    petCosmetics: [],
    petSkins: [],
    provenance: {},
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    resolutions: {},
    skillLevels: {},
    spells: [],
    unlockedPerks: [],
    villagerRelationships: {},
    ...overrides.progress,
  };

  return {
    preferences: {
      availabilityWindows: overrides.availabilityWindows ?? [...DEFAULT_AVAILABILITY_WINDOWS],
      showSpoilers: overrides.showSpoilers ?? false,
    },
    progress: {
      progress,
      version: CURRENT_SERIALIZATION_VERSION,
      worldState: overrides.worldState ?? { season: "spring", weather: "calm" },
    },
  };
}

export async function expectResolvedTheme(page: Page, theme: AccessibilityTheme): Promise<void> {
  // oxlint-disable-next-line playwright/no-raw-locators -- the theme class lives on the document element, which has no role
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
}

/** Switch through the hydrated UI without navigating or replacing the current state. */
export async function switchTheme(page: Page, theme: AccessibilityTheme): Promise<void> {
  const trigger = page.getByRole("button", { exact: true, name: "Quick settings" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Quick settings" });
  await dialog
    .getByRole("radio", { exact: true, name: theme === "dark" ? "Dark" : "Light" })
    .click();
  await expectResolvedTheme(page, theme);
  await trigger.click();
  await expect(dialog).toBeHidden();
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
  theme: "system" | AccessibilityTheme,
  state: null | StoredState = null,
): Promise<void> {
  await page.addInitScript(
    ({ entries, themeKey, themePreference }) => {
      localStorage.clear();
      localStorage.setItem(themeKey, themePreference);
      for (const [key, value] of entries) localStorage.setItem(key, value);
    },
    {
      entries: state
        ? [
            [PREFERENCES_STORAGE_KEY, JSON.stringify(state.preferences)],
            [PROGRESS_STORAGE_KEY, JSON.stringify(state.progress)],
          ]
        : [],
      themeKey: THEME_STORAGE_KEY,
      themePreference: theme,
    },
  );
}
