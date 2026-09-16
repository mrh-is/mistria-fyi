import { expect, test } from "@playwright/test";

import { accessibilityRoutes } from "./routes.js";
import {
  expectResolvedTheme,
  gotoApplication,
  initializeApplication,
} from "./support/application-state.js";
import { analyzeAccessibility } from "./support/axe.js";

import type { AccessibilityTheme } from "./support/violations.js";

const themes = ["light", "dark"] as const satisfies readonly AccessibilityTheme[];

const auditRegressionByRoute: Partial<Record<string, string>> = {
  "/": "c166673 unnamed progress bars, fixed by #155",
  "/characters": "c166673 unnamed buttons and contrast violations, fixed by #154 and #155",
  "/mines": "c166673 unlabeled input and contrast violations, fixed by #154 and #155",
  "/settings": "c166673 contrast violations, fixed by #154",
};

test.describe("complete route and theme axe matrix", () => {
  for (const theme of themes) {
    for (const route of accessibilityRoutes) {
      test(`${route.name} passes serious and critical axe checks in ${theme} mode`, async ({
        page,
      }, testInfo) => {
        const provenance = auditRegressionByRoute[route.path];
        if (provenance) testInfo.annotations.push({ type: "audit", description: provenance });

        await initializeApplication(page, theme);
        const response = await gotoApplication(page, route.path);

        expect(response?.ok()).toBe(true);
        await expect(page.getByRole("main")).toBeVisible();
        await expectResolvedTheme(page, theme);
        await analyzeAccessibility(page, { route: route.path, state: "initial", theme }, testInfo);
      });
    }
  }
});
