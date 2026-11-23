// oxlint-disable playwright/no-raw-locators -- Contents counts, tabs, and the flyleaf have no semantic roles.
import { expect, test } from "../browser/test.js";
import {
  createStoredState,
  gotoRenderedApplication,
  initializeApplication,
} from "./support/application-state.js";
import { requireBox } from "./support/boxes.js";

test("Home Contents counts fit beside their tabs at narrow and wide widths", async ({ page }) => {
  await initializeApplication(
    page,
    "light",
    createStoredState({
      progress: {
        renown: 100,
      },
      showSpoilers: true,
    }),
  );
  await gotoRenderedApplication(page, "/");
  const contents = page.getByRole("navigation", { name: "Contents" });
  const links = contents.getByRole("link");
  await expect(links).toHaveCount(11);
  await expect(contents.getByRole("link", { name: "Renown, 100 of 100 completed" })).toBeVisible();
  await expect(
    contents.getByRole("link", { name: /^Almanac, 0 of \d,\d{3} completed$/u }),
  ).toBeVisible();
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ height: 800, width });
    const index = await requireBox(contents);
    const places = await requireBox(page.getByRole("region", { name: "Places to go today" }));
    const plate = await requireBox(page.locator(".bookplate"));
    expect(plate.y).toBeGreaterThanOrEqual(index.y + index.height);
    if (width === 1280) {
      expect(index.x + index.width).toBeLessThan(places.x);
      expect(index.y).toBeLessThan(places.y + places.height);
    } else {
      expect(index.y).toBeGreaterThanOrEqual(places.y + places.height);
    }
    const countEnds: number[] = [];
    for (const link of await links.all()) {
      const count = link.locator(".index-count");
      const box = await requireBox(count);
      const tab = await requireBox(link.locator(".index-tab"));
      const row = await requireBox(link);
      countEnds.push(box.x + box.width);
      expect(await count.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      expect(box.x + box.width).toBeLessThanOrEqual(row.x + row.width);
      if (width === 1280) expect(tab.x + tab.width).toBeLessThan(box.x);
      else expect(box.x + box.width).toBeLessThan(tab.x);
    }
    expect(Math.max(...countEnds) - Math.min(...countEnds)).toBeLessThan(1);
  }
});
