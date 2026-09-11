import { expect, test } from "@playwright/test";

import {
  createStoredState,
  gotoApplication,
  initializeApplication,
} from "./support/application-state.js";

test.describe("@critical keyboard and focus accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await initializeApplication(page, "light");
  });

  test("toolbar controls follow a predictable focus order", async ({ page }) => {
    await gotoApplication(page, "/");
    const tools = page.getByRole("navigation", { name: "Tracker tools" });
    await tools.getByRole("link", { name: "Settings" }).focus();
    await page.keyboard.press("Tab");
    await expect(tools.getByRole("button", { name: "Send feedback" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(tools.getByRole("button", { name: "Search" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(tools.getByRole("button", { name: "Visibility filters" })).toBeFocused();
  });

  test("feedback dialog contains focus and restores it on Escape", async ({ page }) => {
    await gotoApplication(page, "/");
    const trigger = page
      .getByRole("navigation", { name: "Tracker tools" })
      .getByRole("button", { name: "Send feedback" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Send feedback" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Message" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("settings disclosures operate with Enter and Space", async ({ page }) => {
    await gotoApplication(page, "/settings");
    const disclosure = page.getByRole("button", { name: /^Theme/ });
    await disclosure.focus();
    await page.keyboard.press("Enter");
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  });

  test("search supports keyboard entry, clearing, and closure", async ({ page }) => {
    await gotoApplication(page, "/");
    const trigger = page.getByRole("button", { name: "Search" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const search = page.getByRole("textbox", { name: "Search items" });
    await expect(search).toBeFocused();
    await search.fill("turnip");
    await expect(page.getByRole("status").filter({ hasText: /\d+ results?/ })).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).press("Enter");
    await expect(search).toHaveValue("");
    await page.getByRole("button", { name: "Cancel" }).press("Enter");
    await expect(trigger).toBeFocused();
  });

  test("row removal moves focus and Undo is keyboard operable", async ({ page }) => {
    await gotoApplication(page, "/almanac");
    await page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed$/ }).click();
    const rows = page.getByRole("button", { name: /^Check (?!spoilered item)/ });
    const nextName = await rows.nth(1).getAttribute("aria-label");
    await rows.first().focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: nextName ?? "" })).toBeFocused();
    const undo = page.getByRole("button", { name: "Undo" });
    await undo.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /^Check / }).first()).toBeVisible();
  });

  test("Townsfolk alphabet and relationship progression preserve keyboard focus", async ({
    page,
  }) => {
    await initializeApplication(
      page,
      "light",
      createStoredState({
        completed: {
          npcLevels: { adeline: 10 },
          npcRelationships: { adeline: "romantic" },
        },
        showSpoilers: true,
      }),
    );
    await gotoApplication(page, "/npcs");
    const letter = page.getByRole("button", { name: "Jump to A, first Townsfolk record" });
    await letter.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#npc-adeline")).toBeFocused();

    const proposal = page.locator("#npc-adeline").getByRole("button", { name: "Record proposal" });
    await proposal.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.locator("#npc-adeline").getByRole("button", { name: "Record marriage" }),
    ).toBeFocused();
  });

  test("specialized numeric records support direct keyboard editing", async ({ page }) => {
    await gotoApplication(page, "/skills");
    await page
      .getByRole("button", { name: /Edit .+ level, currently 0 of 60/ })
      .first()
      .press("Enter");
    const skillInput = page.getByRole("spinbutton").first();
    await skillInput.fill("22");
    await skillInput.press("Enter");
    await expect(page.getByText("22 / 60").first()).toBeVisible();

    await gotoApplication(page, "/mines");
    const floorInput = page.getByRole("spinbutton", { name: "Mine floor" });
    await floorInput.fill("21");
    await floorInput.press("Tab");
    await expect(page.getByRole("group", { name: /Mine floor, 21 of/ })).toBeVisible();

    await gotoApplication(page, "/renown");
    await page.getByRole("button", { name: /Edit renown level, currently/ }).press("Enter");
    const renownInput = page.getByRole("spinbutton", { name: "Renown level" });
    await renownInput.fill("10");
    await renownInput.press("Enter");
    await expect(page.getByRole("group", { name: /Renown level, 10 of/ })).toBeVisible();
  });
});
