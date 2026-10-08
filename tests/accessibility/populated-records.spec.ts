import { test } from "../browser/test.js";
import {
  createStoredState,
  expectResolvedTheme,
  gotoApplication,
  initializeApplication,
} from "./support/application-state.js";
import { analyzeAccessibility, themeSensitiveRules } from "./support/axe.js";
import { criticalWhen } from "./support/tags.js";

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
  // Populated values reveal controls absent from the initial DOM, so they need a separate full scan.
  for (const path of ["/villagers", "/skills", "/mines", "/renown", "/everything"] as const) {
    test(
      `${path} populated specialized records pass axe in both themes`,
      criticalWhen(path === "/villagers"),
      async ({ page }, testInfo) => {
        await page.emulateMedia({ colorScheme: "light" });
        await initializeApplication(page, "system", specializedState);
        await gotoApplication(page, path);

        await expectResolvedTheme(page, "light");
        await analyzeAccessibility(
          page,
          { route: path, state: "populated-records", theme: "light" },
          testInfo,
        );
        await page.emulateMedia({ colorScheme: "dark" });
        await expectResolvedTheme(page, "dark");
        await analyzeAccessibility(
          page,
          { route: path, state: "populated-records", theme: "dark" },
          testInfo,
          themeSensitiveRules,
        );
      },
    );
  }
});
