import { expect } from "@playwright/test";

import type { Locator } from "@playwright/test";

export interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** The locator's bounding box, failing loudly where Playwright would return `null`. */
export async function requireBox(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`Expected ${String(locator)} to have a bounding box`);
  return box;
}

/**
 * The locator's bounding box once two consecutive reads agree, so a transition or reflow in
 * flight is never measured. Replaces fixed sleeps before geometry assertions.
 */
export async function settledBox(locator: Locator): Promise<Box> {
  let previous: Box | undefined;
  let settled: Box | undefined;
  await expect
    .poll(
      async () => {
        const box = await requireBox(locator);
        const stable =
          previous !== undefined &&
          previous.x === box.x &&
          previous.y === box.y &&
          previous.width === box.width &&
          previous.height === box.height;
        previous = box;
        if (stable) settled = box;
        return stable;
      },
      { intervals: [50, 100, 100, 250] },
    )
    .toBe(true);
  if (settled === undefined) throw new Error("Geometry never settled");
  return settled;
}
