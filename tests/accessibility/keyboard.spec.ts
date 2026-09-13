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
    await tools.getByRole("button", { name: "Quick settings" }).focus();
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

  test("quick settings operates with Enter and Space", async ({ page }) => {
    await gotoApplication(page, "/");
    const trigger = page.getByRole("button", { exact: true, name: "Quick settings" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("region", { name: "Quick settings" })).toBeVisible();
    await trigger.focus();
    await page.keyboard.press("Space");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
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

  test("Townsfolk pointer scrubbing follows the active letter without snapping back", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await initializeApplication(page, "light", createStoredState({ showSpoilers: true }));
    await gotoApplication(page, "/npcs");

    const initialD = page.getByRole("button", { name: "Jump to D, first Townsfolk record" });
    const initialO = page.getByRole("button", { name: "Jump to O, first Townsfolk record" });
    const initialT = page.getByRole("button", { name: "Jump to T, first Townsfolk record" });
    await initialO.click();
    await expect(page.locator('[id^="npc-o"]:focus')).toHaveCount(1);
    const dBox = await initialD.boundingBox();
    const tBox = await initialT.boundingBox();

    await page.mouse.move((dBox?.x ?? 0) + 12, (dBox?.y ?? 0) + (dBox?.height ?? 0) / 2);
    await page.mouse.down();
    await expect(initialD).toHaveAttribute("data-active", "true");
    await page.mouse.move((tBox?.x ?? 0) + 12, (tBox?.y ?? 0) + (tBox?.height ?? 0) / 2, {
      steps: 8,
    });
    await expect(page.locator('[id^="npc-t"]:focus')).toHaveCount(1);
    await expect(initialD).toHaveAttribute("data-active", "false");
    await expect(initialT).toHaveAttribute("data-active", "true");

    await page.mouse.up();
    await expect(page.locator('[id^="npc-t"]:focus')).toHaveCount(1);
    await expect(initialT).toHaveAttribute("data-active", "false");
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
    const renownInput = page.getByRole("spinbutton", { name: "Renown level" });
    await renownInput.fill("10");
    await renownInput.press("Tab");
    await expect(page.getByRole("group", { name: /Renown level, 10 of/ })).toBeVisible();
  });
});
