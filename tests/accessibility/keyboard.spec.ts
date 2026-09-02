import { expect, test } from "@playwright/test";

import { initializeApplication } from "./support/application-state.js";

test.describe("@critical keyboard and focus accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await initializeApplication(page, "light");
  });

  test("toolbar controls follow a predictable focus order", async ({ page }) => {
    await page.goto("/");
    const tools = page.getByRole("navigation", { name: "Tracker tools" });
    await tools.getByRole("button", { name: "Send feedback" }).focus();
    await page.keyboard.press("Tab");
    await expect(tools.getByRole("button", { name: "Search" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(tools.getByRole("button", { name: "Visibility filters" })).toBeFocused();
  });

  test("feedback dialog contains focus and restores it on Escape", async ({ page }) => {
    await page.goto("/");
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
    await page.goto("/settings");
    const disclosure = page.getByRole("button", { name: /^Theme/ });
    await disclosure.focus();
    await page.keyboard.press("Enter");
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  });

  test("search supports keyboard entry, clearing, and closure", async ({ page }) => {
    await page.goto("/");
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
    await page.goto("/almanac");
    await page.getByRole("button", { name: /^Artifacts 0\/\d+$/ }).click();
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
});
