import { test } from "../browser/test.js";
import {
  createStoredState,
  gotoApplication,
  initializeApplication,
} from "./support/application-state.js";
import { analyzeAccessibility } from "./support/axe.js";
import { criticalWhen } from "./support/tags.js";

import type { AccessibilityTheme } from "./support/violations.js";

const specializedState = createStoredState({
  availabilityWindows: ["now", "anytime", "later"],
  progress: {
    heartLevels: { adeline: 10 },
    mineFloor: 21,
    renown: 14,
    skillLevels: { mining: 22 },
    spells: [],
    villagerRelationships: { adeline: "romantic" },
  },
  showSpoilers: true,
});

test.describe("populated records accessibility", () => {
  for (const theme of ["light", "dark"] satisfies AccessibilityTheme[]) {
    for (const path of ["/villagers", "/skills", "/mines", "/renown", "/everything"] as const) {
      test(
        `${path} populated specialized records pass axe in ${theme} theme`,
        criticalWhen(path === "/villagers" && theme === "light"),
        async ({ page }, testInfo) => {
          await initializeApplication(page, theme, specializedState);
          await gotoApplication(page, path);

          await analyzeAccessibility(
            page,
            { route: path, state: "populated-records", theme },
            testInfo,
          );
        },
      );
    }
  }
});
