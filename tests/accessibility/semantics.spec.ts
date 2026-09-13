import { expect, test } from "@playwright/test";

import { accessibilityRoutes } from "./routes.js";
import {
  createStoredState,
  gotoApplication,
  initializeApplication,
} from "./support/application-state.js";
import { openFeedbackValidation, openVisibilityPanel } from "./support/scenarios.js";

test.describe("@critical semantic accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await initializeApplication(page, "light");
  });

  for (const route of accessibilityRoutes) {
    test(`${route.path} has a named main landmark and page heading`, async ({ page }) => {
      await gotoApplication(page, route.path);
      await expect(page.getByRole("main")).toBeVisible();
      const headingName =
        route.path === "/"
          ? "Mistria Field Guide"
          : route.path === "/all"
            ? "Everything"
            : route.path === "/settings"
              ? "Data management"
              : route.name;
      await expect(page.getByRole("heading", { level: 1, name: headingName })).toBeVisible();
    });
  }

  test("progress indicators expose their current values", async ({ page }) => {
    await gotoApplication(page, "/");
    await expect(page.getByRole("img", { name: /0 of \d+ completed overall/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Almanac, 0 of \d+ completed/ })).toBeVisible();

    await gotoApplication(page, "/renown");
    const progress = page.getByRole("progressbar", { name: /Renown progress/ });
    await expect(progress).toHaveAttribute("aria-valuemin", "0");
    await expect(progress).toHaveAttribute("aria-valuemax", /\d+/);
    await expect(page.getByRole("group", { name: /Renown level, 0 of \d+/ })).toBeVisible();
  });

  test("NPC records expose one level value and non-interactive marks", async ({ page }) => {
    await initializeApplication(
      page,
      "light",
      createStoredState({
        completed: { npcLevels: { adeline: 8 } },
        showSpoilers: true,
      }),
    );
    await gotoApplication(page, "/npcs");
    const record = page.locator("#npc-adeline");
    await expect(
      record.getByRole("group", { name: "Adeline relationship level, 8 of 12" }),
    ).toBeVisible();
    await expect(record.locator("[data-npc-mark]")).toHaveCount(12);
    await expect(record.locator("[data-npc-mark] button")).toHaveCount(0);
    await expect(record.getByRole("button", { name: "Decrease Adeline hearts" })).toBeVisible();
    await expect(record.getByRole("button", { name: "Increase Adeline hearts" })).toBeVisible();
    await expect(record.getByRole("button", { name: "Best friends" })).toBeVisible();
    await expect(record.getByRole("button", { name: "Start dating" })).toBeVisible();
  });

  test("mine and visibility controls expose values and state", async ({ page }) => {
    await gotoApplication(page, "/mines");
    const floor = page.getByRole("spinbutton", { name: "Mine floor" });
    await expect(floor).toHaveAttribute("min", "0");
    await expect(floor).toHaveAttribute("max", /\d+/);

    await gotoApplication(page, "/almanac");
    await openVisibilityPanel(page);
    const spring = page.getByRole("button", { exact: true, name: "Spring" });
    await expect(spring).toHaveAttribute("aria-pressed", "true");
  });

  test("feedback validation connects its input and alert", async ({ page }) => {
    await gotoApplication(page, "/");
    await openFeedbackValidation(page);
    const message = page.getByRole("textbox", { name: "Message" });
    const errorId = await message.getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    await expect(page.locator(`#${errorId}`)).toHaveRole("alert");
    await expect(page.locator(`#${errorId}`)).toHaveText("Please enter a message.");
  });
});
