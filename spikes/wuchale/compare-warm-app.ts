/// <reference types="node" />

import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { builtLocaleChunks } from "../../scripts/built-locale-chunks.js";

import type { Locator, Page } from "@playwright/test";

const [baselineOrigin, baselineClient, candidateOrigin, candidateClient, count = "7"] =
  process.argv.slice(2);
const trials = Number(count);
assert.ok(
  baselineOrigin &&
    baselineClient &&
    candidateOrigin &&
    candidateClient &&
    Number.isSafeInteger(trials) &&
    trials > 0,
  "Usage: compare-warm-app.ts BASELINE_ORIGIN BASELINE_CLIENT CANDIDATE_ORIGIN CANDIDATE_CLIENT [TRIALS]",
);

const baseline = { client: baselineClient, name: "Paraglide", origin: baselineOrigin };
const candidate = { client: candidateClient, name: "Wuchale", origin: candidateOrigin };
const builds = [baseline, candidate];
const browser = await chromium.launch();

try {
  const offlineFill = await Promise.all(builds.map((build) => measureOfflineFill(build)));
  const samples = [];
  for (const serviceWorkers of ["block", "allow"] as const) {
    for (let trial = 0; trial < trials; trial += 1) {
      const order = trial % 2 === 0 ? builds : [candidate, baseline];
      for (const build of order) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Alternate builds without competing browser work.
        const sample = await measureWarm(build, serviceWorkers);
        samples.push({ build: build.name, serviceWorkers, trial: trial + 1, ...sample });
      }
    }
  }
  process.stdout.write(`${JSON.stringify({ offlineFill, samples }, null, 2)}\n`);
} finally {
  await browser.close();
}

function localeAssets(client: string, locale: "en" | "es") {
  const chunks = builtLocaleChunks(client)[locale];
  assert.ok(chunks.length > 0, `The worker has no ${locale} assets`);
  return chunks;
}

async function waitForOfflineAssets(page: Page, assets: string[]) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, {
    timeout: 15_000,
  });
  await page.waitForFunction(
    async (paths) => {
      const responses = await Promise.all(paths.map((asset) => caches.match(asset)));
      return responses.every(Boolean);
    },
    assets,
    { timeout: 15_000 },
  );
}

async function loadHome(page: Page, origin: string, locale: "en" | "es") {
  const response = await page.goto(new URL(`/${locale}`, origin).href);
  assert.equal(response?.status(), 200);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

async function measureOfflineFill(build: (typeof builds)[number]) {
  const assets = [
    ...new Set([...localeAssets(build.client, "en"), ...localeAssets(build.client, "es")]),
  ];
  const page = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await loadHome(page, build.origin, "es");
    await waitForOfflineAssets(page, assets);
    const files = await Promise.all(
      assets.map((asset) => readFile(path.resolve(build.client, `.${asset}`))),
    );
    return {
      assets: files.length,
      build: build.name,
      gzipBytes: files.reduce((total, file) => total + gzipSync(file).length, 0),
    };
  } finally {
    await page.context().close();
  }
}

async function measureWarm(build: (typeof builds)[number], serviceWorkers: "allow" | "block") {
  const page = await browser.newPage({ reducedMotion: "reduce", serviceWorkers });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await loadHome(page, build.origin, "en");
    if (serviceWorkers === "allow") {
      await waitForOfflineAssets(page, localeAssets(build.client, "en"));
    }
    const almanac = page.locator('a[href="/en/almanac"]').first();
    const firstAlmanacMs = await measureClick(almanac, "/en/almanac", "h1");
    await page.goBack();
    await expect(page).toHaveURL(/\/en$/u);
    const revisitAlmanacMs = await measureClick(almanac, "/en/almanac", "h1");
    await page.goBack();
    await expect(page).toHaveURL(/\/en$/u);
    await page.getByRole("button", { name: "Quick settings" }).click();
    await page.getByRole("button", { name: "Choose language" }).click();
    const switchToSpanishMs = await measureClick(
      page.getByRole("button", { name: /^Español/u }),
      "/es",
      '[aria-label="Ajustes rápidos"]',
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    assert.deepEqual(errors, []);
    return { firstAlmanacMs, revisitAlmanacMs, switchToSpanishMs };
  } finally {
    await page.context().close();
  }
}

/** Time from the DOM click to a rendered destination, using the browser clock. */
async function measureClick(target: Locator, pathname: string, selector: string) {
  return target.evaluate(
    async (element, destination) => {
      if (!(element instanceof HTMLElement)) throw new Error("Expected a clickable HTML element");
      const start = performance.now();
      // Activate the control without hover preloading.
      element.click();
      while (performance.now() - start < 20_000) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Sample after each animation frame.
        await new Promise(requestAnimationFrame);
        const content = document.querySelector(destination.selector);
        if (location.pathname === destination.pathname && content?.getClientRects().length) {
          return performance.now() - start;
        }
      }
      throw new Error(`Destination did not render: ${destination.pathname}`);
    },
    { pathname, selector },
  );
}
