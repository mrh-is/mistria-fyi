import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { expect, test } from "../browser/test.js";
import {
  createStoredState,
  gotoApplication,
  initializeApplication,
} from "./support/application-state.js";
import { analyzeAccessibility } from "./support/axe.js";
import {
  openFeedbackValidation,
  openSearch,
  openSettingsCard,
  openShelf,
  openVisibilityPanel,
} from "./support/scenarios.js";
import { critical } from "./support/tags.js";

const emptyPlayerPath = fileURLToPath(
  new URL("fixtures/import/empty-player.json", import.meta.url),
);
const progressPlayerPath = fileURLToPath(
  new URL("fixtures/import/progress-player.json", import.meta.url),
);

test.describe("stateful accessibility", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const state =
      testInfo.title.includes("spoiler-hidden") || testInfo.title.includes("completed rows")
        ? createStoredState()
        : null;
    await initializeApplication(page, "light", state);
  });

  test("expanded visibility controls pass axe", critical, async ({ page }, testInfo) => {
    await gotoApplication(page, "/almanac");
    await openVisibilityPanel(page);

    await analyzeAccessibility(
      page,
      { route: "/almanac", state: "visibility-panel-expanded", theme: "light" },
      testInfo,
    );
  });

  test("populated and empty search results pass axe", async ({ page }, testInfo) => {
    await gotoApplication(page, "/");
    await openSearch(page, "turnip");
    await expect(page.getByRole("status").filter({ hasText: /\d+ results?/ })).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/", state: "populated-search", theme: "light" },
      testInfo,
    );

    await page.getByRole("textbox", { name: "Search items" }).fill("zzzz-no-result");
    await expect(page.getByRole("status").filter({ hasText: "No items found" })).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/", state: "empty-search", theme: "light" },
      testInfo,
    );
  });

  test("a lone villager search result keeps its rounded paper", async ({ page }) => {
    await gotoApplication(page, "/");
    await openSearch(page, "Adeline");
    const link = page.getByRole("link", { name: /Adeline/ }).first();
    await expect(link).toBeVisible();

    const paper = await link.evaluate((element) => {
      const surface = element
        .closest("[data-tracker-row]")
        ?.querySelector(".tracker-paper__surface");
      if (!surface) throw new Error("Villager result has no paper surface");
      const style = getComputedStyle(surface);
      return {
        borderStart: style.borderBlockStartWidth,
        endEnd: style.borderEndEndRadius,
        endStart: style.borderEndStartRadius,
        startEnd: style.borderStartEndRadius,
        startStart: style.borderStartStartRadius,
      };
    });

    expect(paper).toEqual({
      borderStart: "1px",
      endEnd: "2px",
      endStart: "2px",
      startEnd: "2px",
      startStart: "2px",
    });
  });

  test("feedback validation dialog passes axe", critical, async ({ page }, testInfo) => {
    await gotoApplication(page, "/");
    await openFeedbackValidation(page);

    await analyzeAccessibility(
      page,
      { route: "/", state: "feedback-validation-error", theme: "light" },
      testInfo,
    );
  });

  test("spoiler-hidden and revealed rows pass axe", critical, async ({ page }, testInfo) => {
    await gotoApplication(page, "/almanac");
    await page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed/ }).click();
    await openShelf(page, "Not now");
    const spoiler = page.getByRole("button", { name: "Reveal spoiler" }).first();
    await expect(spoiler).toBeVisible();
    const spoilerText = await spoiler.textContent();
    const spoilerName = spoilerText?.trim();
    if (!spoilerName) throw new Error("Spoiler control had no searchable item name");
    await openSearch(page, spoilerName);
    await expect(page.getByRole("button", { name: "Reveal spoiler" })).toHaveCount(0);
    await analyzeAccessibility(
      page,
      { route: "/almanac", state: "spoiler-hidden", theme: "light" },
      testInfo,
    );

    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed/ }).click();
    await openShelf(page, "Not now");
    await expect(spoiler).toBeVisible();
    await spoiler.click();
    await analyzeAccessibility(
      page,
      { route: "/almanac", state: "spoiler-revealed", theme: "light" },
      testInfo,
    );
  });

  test("completed rows and Undo pass axe", async ({ page }, testInfo) => {
    await gotoApplication(page, "/almanac");
    await page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed/ }).click();
    const completion = page.getByRole("button", { name: /^Check (?!spoilered item)/ }).first();
    await completion.click();
    await expect(page.getByRole("button", { exact: true, name: "Undo" })).toBeVisible();

    await analyzeAccessibility(
      page,
      { route: "/almanac", state: "completed-row-hidden-with-undo", theme: "light" },
      testInfo,
    );

    await page.getByRole("button", { expanded: false, name: "Completed" }).first().click();
    await expect(page.getByRole("button", { name: /^Uncheck / }).first()).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/almanac", state: "completed-row-shown", theme: "light" },
      testInfo,
    );
  });

  // Result semantics live in colocated ImportCard/BackupCard client tests.
  // These browser probes wait for each result before scanning its distinct assembled DOM.
  test("settings dialog and import results pass axe", async ({ page }, testInfo) => {
    await gotoApplication(page, "/data");
    await openSettingsCard(page, "Import from save file");
    await page.getByRole("button", { name: "Where is my save file?" }).click();
    await expect(page.getByRole("dialog", { name: "Finding your save file" })).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/data", state: "save-location-dialog", theme: "light" },
      testInfo,
    );
    await page.getByRole("button", { name: "Got it" }).click();

    const fileInput = page.getByLabel("Choose save files to import");
    await fileInput.setInputFiles({
      buffer: await readFile(emptyPlayerPath),
      mimeType: "application/json",
      name: "player.json",
    });
    await expect(page.getByText(/Your field guide is .* complete/)).toBeVisible();
    await expect(page.getByText(/Imported from player.json/)).toBeHidden();
    await page.getByText("What we added", { exact: true }).click();
    await expect(page.getByText(/Imported from player.json/)).toBeVisible();
    await page.getByText("Save details", { exact: true }).click();
    await analyzeAccessibility(
      page,
      { route: "/data", state: "import-details-expanded", theme: "light" },
      testInfo,
    );
    await page.getByText("What we added", { exact: true }).click();
    await page.getByText("Save details", { exact: true }).click();
    await fileInput.setInputFiles({
      buffer: await readFile(emptyPlayerPath),
      mimeType: "application/json",
      name: "player.json",
    });
    await expect(page.getByText("No new data to import", { exact: true })).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/data", state: "import-empty-result", theme: "light" },
      testInfo,
    );

    await fileInput.setInputFiles({
      buffer: await readFile(progressPlayerPath),
      mimeType: "application/json",
      name: "player.json",
    });
    await expect(page.getByText(/Your field guide is .* complete/)).toBeVisible();
    await page.getByText("What we added", { exact: true }).click();
    await expect(page.getByText(/Imported from player.json/)).toBeVisible();
    await expect(page.getByText("1 warnings", { exact: true })).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/data", state: "import-success-warning", theme: "light" },
      testInfo,
    );

    await fileInput.setInputFiles({
      buffer: Buffer.from("not-json"),
      mimeType: "application/json",
      name: "player.json",
    });
    await expect(page.getByRole("alert")).toContainText("player.json isn’t valid JSON; skipped");
    await analyzeAccessibility(
      page,
      { route: "/data", state: "import-error", theme: "light" },
      testInfo,
    );
  });

  test("replacement device guidance passes axe", async ({ page }, testInfo) => {
    await gotoApplication(page, "/data?section=transfer");
    await expect(page.getByRole("link", { exact: true, name: "Set up sync" })).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/data", state: "device-guidance", theme: "light" },
      testInfo,
    );
    await page.getByRole("button", { exact: true, name: "Go to Backup & restore" }).click();
    await expect(page.getByRole("button", { name: "Export backup" })).toBeVisible();
  });

  test("backup restore failure passes axe", async ({ page }, testInfo) => {
    await gotoApplication(page, "/data");
    await openSettingsCard(page, "Backup & restore");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Restore from backup" }).click();
    const chooserDialog = await chooser;
    await chooserDialog.setFiles({
      buffer: await readFile(progressPlayerPath),
      mimeType: "application/json",
      name: "invalid-backup.json",
    });
    await expect(page.getByRole("alert")).toContainText("missing some data");
    await analyzeAccessibility(
      page,
      { route: "/data", state: "backup-restore-error", theme: "light" },
      testInfo,
    );
  });
});

test("dark expanded settings state passes axe", async ({ page }, testInfo) => {
  await initializeApplication(page, "dark", createStoredState({ showSpoilers: true }));
  await gotoApplication(page, "/data");
  await openSettingsCard(page, "Danger zone");

  await analyzeAccessibility(
    page,
    { route: "/data", state: "danger-zone-expanded", theme: "dark" },
    testInfo,
  );
});
