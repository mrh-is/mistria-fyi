import { expect, test } from "@playwright/test";

import { accessibilityRoutes } from "./routes.js";
import { initializeApplication } from "./support/application-state.js";
import { openFeedbackValidation, openVisibilityPanel } from "./support/scenarios.js";

test.describe("@critical semantic accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await initializeApplication(page, "light");
  });

  for (const route of accessibilityRoutes) {
    test(`${route.path} has a named main landmark and page heading`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole("main")).toBeVisible();
      const headingName =
        route.path === "/"
          ? "Mistria Field Guide"
          : route.path === "/all"
            ? "Everything"
            : route.name;
      await expect(page.getByRole("heading", { level: 1, name: headingName })).toBeVisible();
    });
  }

  test("progress indicators expose their current values", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("img", { name: /0 of \d+ completed overall/ })).toBeVisible();

    await page.goto("/renown");
    const progress = page.getByRole("progressbar", { name: /Renown progress/ });
    await expect(progress).toHaveAttribute("aria-valuemin", "0");
    await expect(progress).toHaveAttribute("aria-valuemax", /\d+/);
    await expect(page.getByRole("group", { name: /Renown level, 0 of \d+/ })).toBeVisible();
  });

  test("repeated NPC controls retain unique visible names and pressed state", async ({ page }) => {
    await page.goto("/npcs");
    const controls = page.getByRole("button", { name: /^Set .+ relationship level to \d+$/ });
    const names = await controls.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")),
    );
    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);
    await controls.first().click();
    await expect(controls.first()).toHaveAttribute("aria-pressed", "true");
  });

  test("mine and visibility controls expose values and state", async ({ page }) => {
    await page.goto("/mines");
    const floor = page.getByRole("spinbutton", { name: "Mine floor" });
    await expect(floor).toHaveAttribute("min", "0");
    await expect(floor).toHaveAttribute("max", /\d+/);

    await page.goto("/almanac");
    await openVisibilityPanel(page);
    await page.getByRole("button", { name: /Seasonality/ }).click();
    const spring = page.getByRole("button", { exact: true, name: "Spring" });
    await expect(spring).toHaveAttribute("aria-pressed", "true");
  });

  test("feedback validation connects its input and alert", async ({ page }) => {
    await page.goto("/");
    await openFeedbackValidation(page);
    const message = page.getByRole("textbox", { name: "Message" });
    const errorId = await message.getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    await expect(page.locator(`#${errorId}`)).toHaveRole("alert");
    await expect(page.locator(`#${errorId}`)).toHaveText("Please enter a message.");
  });
});
