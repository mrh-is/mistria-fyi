/// <reference types="node" />

import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const [baselineOrigin, baselineClient, candidateOrigin, candidateClient] = process.argv.slice(2);
assert.ok(
  baselineOrigin && baselineClient && candidateOrigin && candidateClient,
  "Usage: compare-cold-app.js BASELINE_ORIGIN BASELINE_CLIENT CANDIDATE_ORIGIN CANDIDATE_CLIENT",
);

const routes = ["/es", "/es/almanac", "/es/data", "/es/about"];
const browser = await chromium.launch();
try {
  const comparison = [];
  for (const route of routes) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Isolate each cold page load from the other measurements.
    const baseline = await measure(baselineOrigin, baselineClient, route);
    // oxlint-disable-next-line eslint/no-await-in-loop -- Keep both builds on the same sequential browser schedule.
    const candidate = await measure(candidateOrigin, candidateClient, route);
    comparison.push({
      baseline,
      candidate,
      jsGzipDelta: candidate.jsGzipBytes - baseline.jsGzipBytes,
      route,
    });
  }
  process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
} finally {
  await browser.close();
}

/**
 * Counts production app JS requested through hydration in a fresh browser context.
 * Compressed size is calculated from the emitted files so the preview server's compression is
 * independent of the result.
 * @param {string} origin
 * @param {string} clientDir
 * @param {string} route
 */
async function measure(origin, clientDir, route) {
  const url = new URL(route, origin);
  const page = await browser.newPage({ reducedMotion: "reduce", serviceWorkers: "block" });
  /** @type {Set<string>} */
  const scripts = new Set();
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const asset = new URL(request.url());
    if (
      asset.origin === url.origin &&
      asset.pathname.startsWith("/_app/immutable/") &&
      asset.pathname.endsWith(".js")
    ) {
      scripts.add(asset.pathname);
    }
  });
  try {
    const response = await page.goto(url.href, { waitUntil: "domcontentloaded" });
    assert.equal(response?.status(), 200);
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    assert.deepEqual(errors, []);
    assert.ok(scripts.size > 0);
    const files = await Promise.all(
      [...scripts].map((asset) => readFile(path.resolve(clientDir, `.${asset}`))),
    );
    return {
      jsGzipBytes: files.reduce((total, file) => total + gzipSync(file).length, 0),
      jsRequests: scripts.size,
    };
  } finally {
    await page.close();
  }
}
