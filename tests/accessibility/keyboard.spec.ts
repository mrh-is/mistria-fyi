import { expect, test } from "../browser/test.js";
import {
  createStoredState,
  gotoApplication,
  initializeApplication,
  switchTheme,
} from "./support/application-state.js";
import { requireBox } from "./support/boxes.js";
import { villagerRecord } from "./support/scenarios.js";
import { useSmallAlmanac } from "./support/small-almanac.js";
import { critical } from "./support/tags.js";

test.describe("keyboard and focus accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await initializeApplication(page, "light", createStoredState());
  });

  test("toolbar controls follow a predictable focus order", critical, async ({ page }) => {
    await gotoApplication(page, "/");
    // At book widths Send a note & Settings sit on the thumb-tab rail, ahead of the page tools.
    await page.getByRole("button", { exact: true, name: "Send feedback" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { exact: true, name: "Quick settings" })).toBeFocused();
    const tools = page.getByRole("navigation", { name: "Field guide tools" });
    await page.keyboard.press("Tab");
    await expect(tools.getByRole("textbox", { name: "Search items" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(tools.getByRole("button", { name: /^Season & weather/ })).toBeFocused();
  });

  test("feedback dialog contains focus and restores it on Escape", critical, async ({ page }) => {
    await gotoApplication(page, "/");
    const trigger = page.getByRole("button", { exact: true, name: "Send feedback" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Send feedback" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Close Send feedback" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("feedback extras card & preview sheet close one layer at a time", async ({ page }) => {
    await gotoApplication(page, "/");
    await page.getByRole("button", { exact: true, name: "Send feedback" }).click();
    const form = page.getByRole("dialog", { name: "Send feedback" });
    await form.getByRole("button", { name: "What the extras send" }).click();
    const card = page.getByRole("dialog", { name: "What the extras send" });
    const slip = card.getByRole("button", { name: "Peek at my progress" });
    await slip.focus();
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: "Your progress" });
    await expect(sheet).toBeVisible();

    for (let step = 0; step < 4; step++) {
      await page.keyboard.press("Tab");
      await expect
        .poll(() => sheet.evaluate((element) => element.contains(document.activeElement)))
        .toBe(true);
    }
    await expect(sheet.getByRole("checkbox", { name: "Attach progress" })).not.toBeChecked();

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(card).toBeVisible();
    await expect(slip).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();
    await expect(form).toBeVisible();
    await expect(form.getByRole("checkbox", { name: "Attach progress" })).not.toBeChecked();
    await page.keyboard.press("Escape");
    await expect(form).toBeHidden();
  });

  test("quick settings operates with Enter and Space", async ({ page }) => {
    await gotoApplication(page, "/");
    const trigger = page.getByRole("button", { exact: true, name: "Quick settings" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("dialog", { name: "Quick settings" })).toBeVisible();
    await trigger.focus();
    await page.keyboard.press("Space");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await switchTheme(page, "dark");
    await switchTheme(page, "light");
  });

  test("search supports keyboard entry, clearing, and closure", async ({ page }) => {
    await gotoApplication(page, "/");
    const search = page.getByRole("textbox", { name: "Search items" });
    await search.focus();
    await page.keyboard.type("turnip");
    await expect(page.getByRole("status").filter({ hasText: /\d+ results?/ })).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).press("Enter");
    await expect(search).toHaveValue("");
    await search.fill("turnip");
    await search.press("Escape");
    await expect(search).toHaveValue("");
    await expect(search).not.toBeFocused();
  });

  test("data management links home from a category page", async ({ page }) => {
    await gotoApplication(page, "/museum");
    await page.getByRole("button", { name: "Quick settings" }).click();
    await page.getByRole("link", { name: "Data" }).click();
    await expect(page).toHaveURL(/\/data$/);

    await page.getByRole("link", { name: "Back to home" }).press("Enter");

    await expect(page).toHaveURL(/\/en$/);
  });

  test(
    "checking a ledger row keeps focus and Undo is keyboard operable",
    critical,
    async ({ page }) => {
      await useSmallAlmanac(page);
      await gotoApplication(page, "/almanac");
      const artifacts = page.getByRole("region", { exact: true, name: "Artifacts" });
      const row = artifacts.getByRole("button", { name: /^Check (?!spoilered item)/ }).first();
      const name = await row.getAttribute("aria-label");
      await row.focus();
      await page.keyboard.press("Space");
      await expect(
        artifacts.getByRole("button", { name: `Uncheck ${name?.slice(6) ?? ""}` }),
      ).toBeFocused();
      const undo = page.getByRole("button", { exact: true, name: "Undo" });
      await undo.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("button", { name: /^Check / }).first()).toBeVisible();
    },
  );

  test("the first check and the starter checks have separate Undo actions", async ({ page }) => {
    await useSmallAlmanac(page);
    await gotoApplication(page, "/almanac");
    const artifacts = page.getByRole("region", { exact: true, name: "Artifacts" });
    const row = artifacts.getByRole("button", { name: /^Check (?!spoilered item)/ }).first();
    const name = await row.getAttribute("aria-label");
    await row.click();

    const itemUndo = page.getByRole("button", { exact: true, name: "Undo" });
    const starterUndo = page.getByRole("button", { name: "Undo starter checks" });
    await expect(page.getByText("We checked off your starter items (266)")).toBeVisible();
    await itemUndo.click({ trial: true });
    await starterUndo.click();

    await expect(starterUndo).toBeHidden();
    await expect(
      artifacts.getByRole("button", { name: `Uncheck ${name?.slice(6) ?? ""}` }),
    ).toBeVisible();
    await itemUndo.click();
    await expect(artifacts.getByRole("button", { name: name ?? "" })).toBeVisible();
  });

  test("Villager marks and relationship progression preserve keyboard focus", async ({ page }) => {
    await initializeApplication(
      page,
      "light",
      createStoredState({
        progress: {
          heartLevels: { adeline: 8 },
          villagerRelationships: { adeline: "romantic" },
        },
        showSpoilers: true,
      }),
    );
    await gotoApplication(page, "/villagers");
    const meter = page.getByRole("slider", { name: "Adeline heart level" });
    await meter.press("End");
    await expect(meter).toHaveAttribute("aria-valuenow", "10");
    await expect(meter).toBeFocused();

    const proposal = villagerRecord(page, "adeline").getByRole("button", {
      name: "Record proposal",
    });
    await proposal.focus();
    await page.keyboard.press("Enter");
    await expect(
      villagerRecord(page, "adeline").getByRole("button", { name: "Record marriage" }),
    ).toBeFocused();
  });

  test("Villager marks accept edits during a fill and offer a single undo", async ({ page }) => {
    await initializeApplication(page, "light", createStoredState({ showSpoilers: true }));
    await gotoApplication(page, "/villagers");

    const meter = page.getByRole("slider", { name: "Adeline heart level" });
    await meter.scrollIntoViewIfNeeded();
    // oxlint-disable-next-line playwright/no-raw-locators -- Marks are visual targets inside one accessible slider.
    const marks = meter.locator("[data-villager-mark]");
    const ninth = await requireBox(marks.nth(8));
    const third = await requireBox(marks.nth(2));
    // oxlint-disable-next-line playwright/no-raw-locators -- The hatch state decorates each visual mark.
    const reached = meter.locator('[data-reached="true"]');
    await page.mouse.click(ninth.x + ninth.width / 2, ninth.y + ninth.height / 2);
    await page.mouse.click(third.x + third.width / 2, third.y + third.height / 2);
    await page.mouse.click(third.x + third.width / 2, third.y + third.height / 2);
    await expect(meter).toHaveAttribute("aria-valuenow", "2");
    await expect(reached).toHaveCount(2);
    const toast = page.getByRole("listitem").filter({ hasText: "Adeline: 0 → 2 hearts" });
    await toast.getByRole("button", { exact: true, name: "Undo" }).click();
    await expect(meter).toHaveAttribute("aria-valuenow", "0");
    await expect(reached).toHaveCount(0);
  });

  test("skill rulers support keyboard editing", async ({ page }) => {
    await gotoApplication(page, "/skills");
    const ruler = page.getByRole("slider", { name: "Archaeology level" });
    await ruler.press("PageUp");
    await ruler.press("ArrowRight");
    await expect(ruler).toHaveAttribute("aria-valuenow", "16");
    await ruler.press("End");
    await expect(ruler).toHaveAttribute("aria-valuetext", "Archaeology, level 60 of 60");
    await ruler.press("Home");
    await expect(ruler).toHaveAttribute("aria-valuenow", "0");
    await expect(ruler).toBeFocused();
  });

  test("vertical meters support keyboard editing", async ({ page }) => {
    await gotoApplication(page, "/mines");
    const shaft = page.getByRole("slider", { name: "Deepest floor" });
    await shaft.press("PageUp");
    await shaft.press("PageUp");
    await expect(shaft).toHaveAttribute("aria-valuetext", "Floor 20 of 100");

    // Floor 21 is past the first seal, so the dialog must work from the keyboard too.
    await shaft.press("ArrowRight");
    await page.getByRole("button", { name: "Yes, just this one" }).press("Enter");
    await expect(shaft).toHaveAttribute("aria-valuenow", "21");

    await gotoApplication(page, "/renown");
    const pole = page.getByRole("slider", { name: "Renown level" });
    await pole.press("PageUp");
    await expect(pole).toHaveAttribute("aria-valuetext", "Renown level 10 of 100, Stone");
    const toast = page.getByRole("listitem").filter({ hasText: "Renown: 0 → 10" });
    await toast.getByRole("button", { exact: true, name: "Undo" }).press("Enter");
    await expect(pole).toHaveAttribute("aria-valuenow", "0");
  });
});
