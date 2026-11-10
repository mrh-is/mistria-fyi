/// <reference types="node" />

import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const [origin, ...options] = process.argv.slice(2);
const screenshots = options.find((option) => !option.startsWith("--"));
const wuchale = options.includes("--wuchale");
const browser = await chromium.launch();
const about = new URL("/es/about", origin).href;

/** @returns {Promise<Record<string, string>>} The emitted About catalog path for each locale. */
async function catalogPaths() {
  const file = path.resolve(
    import.meta.dirname,
    "../../.svelte-kit/output/client/.vite/manifest.json",
  );
  const manifest = /** @type {Record<string, { file: string }>} */ (
    JSON.parse(await readFile(file, "utf8"))
  );
  return Object.fromEntries(
    Object.entries(manifest).flatMap(([source, chunk]) => {
      const match = /\/\.wuchale\/about\.0\.([^.]+)\.compiled\.js$/u.exec(source);
      return match ? [[match[1], `/${chunk.file}`]] : [];
    }),
  );
}

try {
  const catalogs = wuchale ? await catalogPaths() : {};
  if (wuchale) assert.equal(Object.keys(catalogs).length, 8);
  const page = await browser.newPage({ reducedMotion: "reduce" });
  /** @type {Set<string>} */
  const scripts = new Set();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/_app/immutable/") && url.pathname.endsWith(".js")) {
      scripts.add(url.pathname);
    }
  });
  const response = await fetch(about);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes("Los datos actuales de la guía"));
  await page.goto(about);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByRole("heading", { exact: true, name: "Datos" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const files = await Promise.all(
    [...scripts].map(async (file) =>
      readFile(path.resolve(import.meta.dirname, "../../build", `.${file}`)),
    ),
  );
  process.stdout.write(
    `${JSON.stringify({
      jsFiles: files.length,
      jsGzipBytes: files.reduce((total, file) => total + gzipSync(file).length, 0),
    })}\n`,
  );

  const target = await page.evaluateHandle(() => {
    const link = document.createElement("a");
    link.href = "/zh-Hant/about";
    link.textContent = "Traditional Chinese probe";
    link.dataset.sveltekitPreloadData = "hover";
    document.body.prepend(link);
    return link;
  });
  const prefetched = wuchale
    ? page.waitForResponse((candidate) => new URL(candidate.url()).pathname === catalogs["zh-Hant"])
    : undefined;
  await target.hover();
  await prefetched;
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { exact: true, name: "Datos" })).toBeVisible();
  await expect(page).toHaveURL(about);
  await target.click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await expect(page.getByRole("heading", { exact: true, name: "資料" })).toBeVisible();

  // Warm the locale from Home. About has never been opened in this browser context.
  const offline = await browser.newPage({
    reducedMotion: "reduce",
    viewport: { height: 800, width: 1280 },
  });
  await offline.goto(new URL("/es", origin).href);
  await offline.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await expect
    .poll(() => offline.evaluate(async () => Boolean(await caches.match("/es/about"))), {
      timeout: 30_000,
    })
    .toBe(true);
  if (wuchale) {
    const cachedCatalogs = await offline.evaluate(async (paths) => {
      const cached = await Promise.all(
        paths.map(async (url) => ((await caches.match(url)) ? url : null)),
      );
      return cached.filter((url) => url !== null);
    }, Object.values(catalogs));
    // The app keeps English offline alongside the active locale for bilingual search.
    assert.deepEqual(new Set(cachedCatalogs), new Set([catalogs.en, catalogs.es]));
  }
  await offline.context().setOffline(true);
  await offline.context().route("**/*", async (route) => route.abort("internetdisconnected"));
  const cached = await offline.goto(about);
  assert.ok(cached?.fromServiceWorker());
  await expect(offline.locator("html")).toHaveAttribute("data-hydrated", "true");
  await expect(offline.getByRole("heading", { exact: true, name: "Datos" })).toBeVisible();
  await expect(offline.getByText(/Los datos actuales de la guía se generaron/u)).toBeVisible();
  if (screenshots) {
    await mkdir(screenshots, { recursive: true });
    await offline.screenshot({
      fullPage: true,
      path: path.join(screenshots, "app-about-desktop.png"),
    });
    await offline.setViewportSize({ height: 844, width: 390 });
    await offline.emulateMedia({ colorScheme: "dark" });
    await offline.screenshot({
      fullPage: true,
      path: path.join(screenshots, "app-about-mobile.png"),
    });
  }
} finally {
  await browser.close();
}
