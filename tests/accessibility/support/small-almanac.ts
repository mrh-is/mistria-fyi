import { readFileSync } from "node:fs";

import trackerDataJson from "../../../src/lib/data/tracker-data.json" with { type: "json" };

import type { Page } from "@playwright/test";

import type { AlmanacEntry, TrackerData } from "../../../src/lib/types/tracker-data.js";

const trackerData = trackerDataJson as unknown as TrackerData;

function fixtureRows(section: string, requiredIds: string[]): AlmanacEntry[] {
  const category = Object.entries(trackerData.almanac).find(([id]) => id === section)?.[1];
  if (!category) throw new Error(`Missing Almanac fixture section: ${section}`);

  const required = requiredIds.map((id) => {
    const entry = category.items.find(({ itemIds }) => itemIds.some((member) => member === id));
    if (!entry) throw new Error(`Missing Almanac fixture item: ${id}`);
    return entry;
  });
  // Include a covered artifact for the spoiler shelf & enough ordinary rows to scroll.
  const covered = category.items.find(({ itemIds: [id] }) => trackerData.items[id].visibility);
  const rows = new Set([
    ...required,
    ...(section === "artifacts" && covered ? [covered] : []),
    ...category.items.filter(({ itemIds: [id] }) => !trackerData.items[id].visibility),
  ]);
  if (rows.size < 10) throw new Error(`Too few rows in Almanac fixture section: ${section}`);
  return [...rows].slice(0, 10);
}

const almanac = {
  artifacts: { items: fixtureRows("artifacts", ["black_tablet", "clay_amphora"]) },
  bugs: { items: fixtureRows("bugs", ["ant"]) },
  furniture: { items: fixtureRows("furniture", ["basic_doormat_yellow"]) },
};

export const completedFixtureBugs = almanac.bugs.items.map(({ itemIds: [id] }) => id);

/** Serve a smaller Almanac through the built app's normal data import. */
export async function useSmallAlmanac(page: Page): Promise<void> {
  const manifest = JSON.parse(
    readFileSync(
      new URL("../../../.svelte-kit/output/client/.vite/manifest.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, { file: string; name?: string }>;
  const chunk = Object.values(manifest).find(({ name }) => name === "tracker-data");
  if (!chunk) throw new Error("The browser build is missing its tracker-data chunk.");

  await page.route(`**/${chunk.file}`, async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    // Vite assigns the JSON object a minified name and exports it once. Match the binding
    // instead of hard-coding a name or modifying the application to accept test data.
    const binding = /\bexport\s*\{\s*([$\w]+)\s+as\s+[$\w]+\s*\}\s*;?\s*$/u.exec(source)?.[1];
    if (!response.ok() || !binding) {
      throw new Error("Expected the built tracker-data chunk to export one JSON binding.");
    }
    await route.fulfill({
      body: `${source}\n${binding}.almanac = ${JSON.stringify(almanac)};\n`,
      contentType: "text/javascript",
    });
  });
}
