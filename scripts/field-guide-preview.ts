import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { PROGRESS_STORAGE_KEY } from "#lib/stores/storage-keys.js";

import {
  HYDRATED_SELECTOR,
  waitForRendering,
} from "../tests/accessibility/support/application-state.js";

const PRESETS = ["day-one", "mid-game", "late-game"] as const;
type Preset = (typeof PRESETS)[number];

export function previewUrl(value: string): URL {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const branchPreview =
    url.hostname === "next.mistria.fyi" ||
    /^[a-z\d-]+\.mistria-fyi\.pages\.dev$/u.test(url.hostname);
  const allowed =
    (loopback && (url.protocol === "http:" || url.protocol === "https:")) ||
    (branchPreview && url.protocol === "https:" && url.port === "");
  if (!allowed || url.username || url.password) {
    throw new Error("Use a local dev URL or a Mistria branch preview URL.");
  }
  return url;
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { screenshot: { type: "string" } },
  });
  const [preset, target] = positionals;
  if (positionals.length !== 2 || !preset || !target || !PRESETS.includes(preset as Preset)) {
    throw new Error(
      "Usage: pnpm run field-guide:preview <day-one|mid-game|late-game> <url> [--screenshot <path>]",
    );
  }
  const url = previewUrl(target);
  const fixtureFile = new URL("fixtures/field-guide-progress.json", import.meta.url);
  const fixtures = JSON.parse(await readFile(fixtureFile, "utf8")) as Record<Preset, unknown>;
  const progress = fixtures[preset as Preset];
  if (!progress) throw new Error(`Missing field guide progress export: ${preset}`);
  const screenshot = values.screenshot;
  const browser = await chromium.launch({ headless: screenshot !== undefined });
  try {
    const page = await browser.newPage({
      reducedMotion: "reduce",
      serviceWorkers: "block",
      viewport: { height: 900, width: 1280 },
    });
    page.setDefaultTimeout(30_000);
    await page.addInitScript(
      ({ key, origin, serialized }) => {
        if (location.origin !== origin || globalThis.top !== globalThis.self) return;
        const marker = "mistria-fyi:preview-seeded";
        if (sessionStorage.getItem(marker) === null) {
          localStorage.setItem(key, serialized);
          sessionStorage.setItem(marker, "true");
        }
      },
      { key: PROGRESS_STORAGE_KEY, origin: url.origin, serialized: JSON.stringify(progress) },
    );
    const response = await page.goto(url.href, { waitUntil: "domcontentloaded" });
    if (!response?.ok() || new URL(page.url()).origin !== url.origin) {
      throw new Error(`The app did not load at ${url.href}`);
    }
    await page.locator(HYDRATED_SELECTOR).waitFor({ state: "attached" });
    await waitForRendering(page);
    if (screenshot === undefined) {
      console.log(`Loaded ${preset}. Close the browser tab when you’re done.`);
      await page.waitForEvent("close", { timeout: 0 });
    } else {
      await page.screenshot({ path: screenshot });
    }
  } finally {
    await browser.close();
  }
}

if (import.meta.main) {
  await main();
}
