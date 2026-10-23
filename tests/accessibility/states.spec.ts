import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { encodeQR } from "qr";

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
    const state = testInfo.title.includes("spoiler-hidden")
      ? createStoredState({ availabilityWindows: ["now", "anytime", "later"] })
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
    await page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed$/ }).click();
    await page.getByRole("button", { name: /Show \d+ more/ }).click();
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
    await page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed$/ }).click();
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
    await page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed$/ }).click();
    const completion = page.getByRole("button", { name: /^Check (?!spoilered item)/ }).first();
    await completion.click();
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();

    await analyzeAccessibility(
      page,
      { route: "/almanac", state: "completed-row-hidden-with-undo", theme: "light" },
      testInfo,
    );

    await openVisibilityPanel(page);
    await page.getByRole("switch", { name: "Completed" }).click();
    await expect(page.getByRole("button", { name: /^Uncheck / }).first()).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/almanac", state: "completed-row-shown", theme: "light" },
      testInfo,
    );
  });

  // Result semantics live in colocated ImportCard/TransferCard/BackupCard client tests.
  // These browser probes wait for each result before scanning its distinct assembled DOM.
  test("settings dialog and import results pass axe", async ({ page }, testInfo) => {
    await gotoApplication(page, "/data");
    await openSettingsCard(page, "Import from Save File");
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
    await expect(page.getByText(/Imported from player.json/)).toBeVisible();
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

  test("transfer generation, success, and failure pass axe", async ({ page }, testInfo) => {
    await initializeApplication(page, "light", null);
    await gotoApplication(page, "/data");
    await openSettingsCard(page, "Transfer to Another Device");
    await page.getByRole("button", { name: "Generate QR Code" }).click();
    const generatedQr = page.getByRole("img", { name: "Transfer QR Code" });
    await expect(generatedQr).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/data", state: "transfer-generated", theme: "light" },
      testInfo,
    );

    const dataUrl = await generatedQr.getAttribute("src");
    if (!dataUrl) throw new Error("Generated transfer QR code had no source");
    const generatedBuffer = Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
    const successChooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /scan from a screenshot/i }).click();
    const successChooserDialog = await successChooser;
    await successChooserDialog.setFiles({
      buffer: generatedBuffer,
      mimeType: "image/png",
      name: "transfer.png",
    });
    await expect(page.getByText(/QR code scanned successfully/).last()).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/data", state: "transfer-success", theme: "light" },
      testInfo,
    );

    // A marked code too short to hold a build fingerprint: recognized, but damaged.
    const invalidBuffer = Buffer.from(encodeQR("MFGTAQ", "gif", { scale: 4 }));
    const errorChooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /scan from a screenshot/i }).click();
    const errorChooserDialog = await errorChooser;
    await errorChooserDialog.setFiles({
      buffer: invalidBuffer,
      mimeType: "image/gif",
      name: "invalid-transfer.gif",
    });
    await expect(page.getByRole("alert")).toContainText(
      "This QR code’s data is damaged or incomplete.",
    );
    await analyzeAccessibility(
      page,
      { route: "/data", state: "transfer-error", theme: "light" },
      testInfo,
    );

    // A marked code with an all-zero build fingerprint: recognized, but from another build.
    const mismatchBuffer = Buffer.from(encodeQR("MFGTAAAAAA", "gif", { scale: 4 }));
    const mismatchChooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /scan from a screenshot/i }).click();
    const mismatchChooserDialog = await mismatchChooser;
    await mismatchChooserDialog.setFiles({
      buffer: mismatchBuffer,
      mimeType: "image/gif",
      name: "other-build-transfer.gif",
    });
    await expect(page.getByRole("alert")).toContainText(
      "This QR code was created by a different version of Mistria Field Guide.",
    );
    await expect(page.getByRole("button", { name: "Copy recovery steps" })).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/data", state: "transfer-version-mismatch", theme: "light" },
      testInfo,
    );
  });

  test("backup restore failure passes axe", async ({ page }, testInfo) => {
    await gotoApplication(page, "/data");
    await openSettingsCard(page, "Backup & Restore");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Restore from backup" }).click();
    const chooserDialog = await chooser;
    await chooserDialog.setFiles({
      buffer: await readFile(progressPlayerPath),
      mimeType: "application/json",
      name: "invalid-backup.json",
    });
    await expect(page.getByRole("alert")).toContainText("missing required data");
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
  await openSettingsCard(page, "Danger Zone");

  await analyzeAccessibility(
    page,
    { route: "/data", state: "danger-zone-expanded", theme: "dark" },
    testInfo,
  );
});
