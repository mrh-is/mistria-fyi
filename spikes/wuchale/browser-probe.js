import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

import spanishNames from "../../src/lib/data/locales/es/ui.json" with { type: "json" };
import taiwanNames from "../../src/lib/data/locales/zh-Hant/ui.json" with { type: "json" };

const [origin, screenshotArg, preloadArg] = process.argv.slice(2);
const screenshots = screenshotArg === "--observe-preload" ? undefined : screenshotArg;
const observePreload = screenshotArg === "--observe-preload" || preloadArg === "--observe-preload";
const browser = await chromium.launch();
const searchUrl = new URL("/es/search?q=té", origin).href;

try {
  // Simultaneous requests exercise the server's shared process with different active locales.
  const cases = [
    ["/es/search?count=2", "es", "2 resultados", spanishNames.fish],
    ["/zh-Hant/search?count=3", "zh-Hant", "3 項結果", taiwanNames.fish],
    ["/unknown/search", "en", "1 result", "Fishing and Diving"],
    ["/ru/search?count=5", "ru", "5 результатов"],
  ];
  await Promise.all(
    cases.map(async ([route, locale, count, gameName]) => {
      const response = await fetch(new URL(route, origin));
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.ok(html.includes(`<html lang="${locale}">`));
      assert.ok(html.includes(count));
      if (gameName) assert.ok(html.includes(gameName));
    }),
  );

  const page = await browser.newPage({
    reducedMotion: "reduce",
    viewport: { height: 720, width: 1280 },
  });
  const errors = [];
  /** @type {Set<string>} */
  const assets = new Set();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname.startsWith("/_app/immutable/") && pathname.endsWith(".js")) assets.add(pathname);
  });
  await page.addInitScript(() => {
    // The SSR input keeps this marker only if hydration claims the server DOM.
    new MutationObserver((_, observer) => {
      const input = document.querySelector("main input");
      if (input instanceof HTMLInputElement) {
        input.dataset.ssr = "claimed";
        observer.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(searchUrl);
  await expect(page.getByRole("textbox")).toHaveAttribute("placeholder", "Buscar elementos…");
  await expect(page.getByRole("textbox")).toHaveAttribute("aria-label", "Buscar elementos");
  await expect(page.getByRole("textbox")).toHaveAttribute("data-ssr", "claimed");
  await expect(page.locator("[data-game-name]")).toHaveText(spanishNames.fish);
  await expect(page.getByRole("link", { name: /té/u })).toHaveCount(1);
  await expect(page.getByText("1 resultado", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByText("2 resultados")).toBeVisible();
  await page.waitForLoadState("networkidle");

  const files = await Promise.all(
    [...assets].map(async (file) => readFile(path.join(import.meta.dirname, "build", file))),
  );
  process.stdout.write(
    `${JSON.stringify({
      containsEnglishSearchCopy: files.some((file) => file.includes("No items found")),
      containsSpanishSettingsCopy: files.some((file) => file.includes("Ajustes rápidos")),
      searchJsBytes: files.reduce((total, file) => total + file.length, 0),
      searchJsGzipBytes: files.reduce((total, file) => total + gzipSync(file).length, 0),
      searchJsRequests: assets.size,
    })}\n`,
  );

  if (screenshots) {
    await mkdir(screenshots, { recursive: true });
    await page.screenshot({ path: path.join(screenshots, "search-desktop.png") });
    await page.setViewportSize({ height: 720, width: 390 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.screenshot({ path: path.join(screenshots, "search-mobile.png") });
  }

  await page.getByRole("link", { name: "繁體中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await expect(page.getByRole("heading")).toHaveText("搜尋物品");
  await expect(page.locator("[data-game-name]")).toHaveText(taiwanNames.fish);
  // This marker is added after the first navigation, so a full document load loses it.
  await page.evaluate(() => {
    document.body.dataset.navigation = "client";
  });
  await page.getByRole("link", { name: "Español" }).click();
  await expect(page.getByRole("heading")).toHaveText("Buscar elementos");
  await expect(page.locator("body")).toHaveAttribute("data-navigation", "client");
  await expect(page.locator("[data-game-name]")).toHaveText(spanishNames.fish);
  await page.getByRole("link", { name: "Settings fixture" }).click();
  await expect(page.getByRole("heading")).toHaveText("Ajustes rápidos");
  if (screenshots) {
    await page.screenshot({ path: path.join(screenshots, "settings-mobile.png") });
    await page.setViewportSize({ height: 720, width: 1280 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.screenshot({ path: path.join(screenshots, "settings-desktop.png") });
  }
  await page.goBack();
  await expect(page.getByRole("heading")).toHaveText("Buscar elementos");
  await page.goto(new URL("/es/search?count=0", origin).href);
  await expect(page.getByText("No se encontraron elementos")).toBeVisible();
  await page.goto(new URL("/es/search?error", origin).href);
  await expect(page.locator("main p").last()).toContainText("búsqueda");
  assert.deepEqual(errors, []);

  if (observePreload) {
    // Reproduce the production app's hover preloading without enabling it on ordinary fixture links.
    const taiwanLink = page.getByRole("link", { name: "繁體中文" });
    await taiwanLink.evaluate((link) => {
      if (link instanceof HTMLAnchorElement) link.dataset.sveltekitPreloadData = "hover";
    });
    await taiwanLink.hover();
    await expect(page.getByRole("heading")).toHaveText("搜尋物品");
    await expect(page.locator("[data-game-name]")).toHaveText(spanishNames.fish);
    await expect(page).toHaveURL(new URL("/es/search?error", origin).href);
    process.stdout.write("Hover preloading changed the Wuchale UI before locale navigation.\n");
  }
} finally {
  await browser.close();
}
