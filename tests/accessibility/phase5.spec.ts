import { test } from "@playwright/test";

import {
  createStoredState,
  gotoApplication,
  initializeApplication,
} from "./support/application-state.js";
import { analyzeAccessibility } from "./support/axe.js";

import type { AccessibilityTheme } from "./support/violations.js";

const specializedState = createStoredState({
  availabilityMode: "everything",
  completed: {
    mines: { floor: 21, spells: [] },
    npcLevels: { adeline: 10 },
    npcRelationships: { adeline: "romantic" },
    renown: 14,
    skillLevels: { mining: 22 },
  },
  showSpoilers: true,
});

test.describe("@critical Phase 5 stateful accessibility", () => {
  for (const theme of ["light", "dark"] satisfies AccessibilityTheme[]) {
    for (const path of ["/characters", "/skills", "/mines", "/renown", "/all"] as const) {
      test(`${path} populated specialized records pass axe in ${theme} theme`, async ({
        page,
      }, testInfo) => {
        await initializeApplication(page, theme, specializedState);
        await gotoApplication(page, path);

        await analyzeAccessibility(
          page,
          { route: path, state: "phase-5-populated", theme },
          testInfo,
        );
      });
    }
  }
});
