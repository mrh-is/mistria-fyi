import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

import { createStoredState, initializeApplication } from "./support/application-state.js";
import { analyzeAccessibility } from "./support/axe.js";
import {
  openFeedbackValidation,
  openSearch,
  openSettingsCard,
  openVisibilityPanel,
} from "./support/scenarios.js";

const emptyPlayerPath = fileURLToPath(
  new URL("./fixtures/import/empty-player.json", import.meta.url),
);
const progressPlayerPath = fileURLToPath(
  new URL("./fixtures/import/progress-player.json", import.meta.url),
);

test.describe("@critical stateful accessibility", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const state = testInfo.title.includes("spoiler-hidden")
      ? createStoredState({ availabilityMode: "everything" })
      : null;
    await initializeApplication(page, "light", state);
  });

  test("expanded visibility controls pass axe", async ({ page }, testInfo) => {
    await page.goto("/almanac");
    await openVisibilityPanel(page);

    await analyzeAccessibility(
      page,
      { route: "/almanac", state: "visibility-panel-expanded", theme: "light" },
      testInfo,
    );
  });

  test("populated and empty search results pass axe", async ({ page }, testInfo) => {
    await page.goto("/");
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

  test("feedback validation dialog passes axe", async ({ page }, testInfo) => {
    await page.goto("/");
    await openFeedbackValidation(page);

    await analyzeAccessibility(
      page,
      { route: "/", state: "feedback-validation-error", theme: "light" },
      testInfo,
    );
  });

  test("spoiler-hidden and revealed rows pass axe", async ({ page }, testInfo) => {
    await page.goto("/almanac");
    await page.getByRole("button", { name: /^Artifacts 0\/\d+$/ }).click();
    await page.getByRole("button", { name: /Show \d+ more/ }).click();
    let spoiler = page.getByRole("button", { name: "Reveal spoiler" }).first();
    await expect(spoiler).toBeVisible();
    const spoilerName = (await spoiler.textContent())?.trim();
    if (!spoilerName) throw new Error("Spoiler control had no searchable item name");
    await openSearch(page, spoilerName);
    spoiler = page.getByRole("button", { name: "Reveal spoiler" }).first();
    await expect(spoiler).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/almanac", state: "spoiler-hidden", theme: "light" },
      testInfo,
    );

    await spoiler.click();
    await analyzeAccessibility(
      page,
      { route: "/almanac", state: "spoiler-revealed", theme: "light" },
      testInfo,
    );
  });

  test("completed rows and Undo pass axe", async ({ page }, testInfo) => {
    await page.goto("/almanac");
    await page.getByRole("button", { name: /^Artifacts 0\/\d+$/ }).click();
    const completion = page.getByRole("button", { name: /^Check (?!spoilered item)/ }).first();
    await completion.click();
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();

    await analyzeAccessibility(
      page,
      { route: "/almanac", state: "completed-row-hidden-with-undo", theme: "light" },
      testInfo,
    );

    await openVisibilityPanel(page);
    await page.getByRole("switch", { name: "Show completed items" }).click();
    await expect(page.getByRole("button", { name: /^Uncheck / }).first()).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/almanac", state: "completed-row-shown", theme: "light" },
      testInfo,
    );
  });

  test("settings dialog and import results pass axe", async ({ page }, testInfo) => {
    await page.goto("/settings");
    await openSettingsCard(page, "Import from Save File");
    await page.getByRole("button", { name: "Where is my save file?" }).click();
    await expect(page.getByRole("dialog", { name: "Finding your save file" })).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/settings", state: "save-location-dialog", theme: "light" },
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
      { route: "/settings", state: "import-empty-result", theme: "light" },
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
      { route: "/settings", state: "import-success-warning", theme: "light" },
      testInfo,
    );

    await fileInput.setInputFiles({
      buffer: Buffer.from("not-json"),
      mimeType: "application/json",
      name: "player.json",
    });
    await expect(page.getByRole("alert")).toContainText("player.json: invalid JSON");
    await analyzeAccessibility(
      page,
      { route: "/settings", state: "import-error", theme: "light" },
      testInfo,
    );
  });

  test("transfer generation, success, and failure pass axe", async ({ page }, testInfo) => {
    await initializeApplication(page, "light", null);
    await page.goto("/settings");
    await openSettingsCard(page, "Transfer to Another Device");
    await page.getByRole("button", { name: "Generate QR Code" }).click();
    const generatedQr = page.getByRole("img", { name: "Transfer QR Code" });
    await expect(generatedQr).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/settings", state: "transfer-generated", theme: "light" },
      testInfo,
    );

    const dataUrl = await generatedQr.getAttribute("src");
    if (!dataUrl) throw new Error("Generated transfer QR code had no source");
    const generatedBuffer = Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
    const successChooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /scan from a screenshot/i }).click();
    await (
      await successChooser
    ).setFiles({
      buffer: generatedBuffer,
      mimeType: "image/png",
      name: "transfer.png",
    });
    await expect(page.getByText(/QR code scanned successfully/).last()).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/settings", state: "transfer-success", theme: "light" },
      testInfo,
    );

    const invalidBuffer = await QRCode.toBuffer("invalid-transfer-payload");
    const errorChooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /scan from a screenshot/i }).click();
    await (
      await errorChooser
    ).setFiles({
      buffer: invalidBuffer,
      mimeType: "image/png",
      name: "invalid-transfer.png",
    });
    await expect(page.getByRole("alert")).toContainText("Invalid QR code");
    await analyzeAccessibility(
      page,
      { route: "/settings", state: "transfer-error", theme: "light" },
      testInfo,
    );
  });

  test("backup restore failure passes axe", async ({ page }, testInfo) => {
    await page.goto("/settings");
    await openSettingsCard(page, "Backup & Restore");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Restore from backup" }).click();
    await (
      await chooser
    ).setFiles({
      buffer: await readFile(progressPlayerPath),
      mimeType: "application/json",
      name: "invalid-backup.json",
    });
    await expect(page.getByRole("alert")).toContainText("invalid or could not be restored");
    await analyzeAccessibility(
      page,
      { route: "/settings", state: "backup-restore-error", theme: "light" },
      testInfo,
    );
  });
});

test("dark expanded settings state passes axe", async ({ page }, testInfo) => {
  await initializeApplication(page, "dark", createStoredState({ showSpoilers: true }));
  await page.goto("/settings");
  await openSettingsCard(page, "Danger Zone");

  await analyzeAccessibility(
    page,
    { route: "/settings", state: "danger-zone-expanded", theme: "dark" },
    testInfo,
  );
});
