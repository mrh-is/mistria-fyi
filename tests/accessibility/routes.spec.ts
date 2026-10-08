import { expect, test } from "../browser/test.js";
import { accessibilityRoutes } from "./routes.js";
import {
  expectResolvedTheme,
  gotoApplication,
  HYDRATED_SELECTOR,
  initializeApplication,
} from "./support/application-state.js";
import { analyzeAccessibility, themeSensitiveRules } from "./support/axe.js";
import { criticalWhen } from "./support/tags.js";

const coreRoutes = new Set<string>(["/", "/almanac", "/villagers", "/everything"]);
const headingOverrides: Record<string, string | undefined> = {
  "/": "Mistria Field Guide",
  "/everything": "Everything",
  "/privacy": "Privacy Policy",
  "/settings": "Data management",
};

const auditRegressionByRoute: Partial<Record<string, string>> = {
  "/": "c166673 unnamed progress bars, fixed by #155",
  "/mines": "c166673 unlabeled input and contrast violations, fixed by #154 and #155",
  "/settings": "c166673 contrast violations, fixed by #154",
  "/villagers": "c166673 unnamed buttons and contrast violations, fixed by #154 and #155",
};

test.describe("route accessibility journeys", () => {
  for (const route of accessibilityRoutes) {
    test(
      `${route.name} hydrates, exposes landmarks, and passes axe in both themes`,
      criticalWhen(coreRoutes.has(route.path)),
      async ({ page }, testInfo) => {
        const provenance = auditRegressionByRoute[route.path];
        if (provenance) testInfo.annotations.push({ type: "audit", description: provenance });

        await page.emulateMedia({ colorScheme: "light" });
        await initializeApplication(page, "system");
        const response = await gotoApplication(page, route.path);

        expect(response?.ok()).toBe(true);
        await expect(page.getByRole("main")).toBeVisible();
        await expect(page.locator(HYDRATED_SELECTOR)).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expect(
          page.getByRole("heading", {
            exact: true,
            level: 1,
            name: headingOverrides[route.path] ?? route.name,
          }),
        ).toBeVisible();
        await expectResolvedTheme(page, "light");
        await analyzeAccessibility(
          page,
          { route: route.path, state: "initial", theme: "light" },
          testInfo,
        );
        await page.emulateMedia({ colorScheme: "dark" });
        await expectResolvedTheme(page, "dark");
        await analyzeAccessibility(
          page,
          { route: route.path, state: "initial", theme: "dark" },
          testInfo,
          themeSensitiveRules,
        );
      },
    );
  }
});
