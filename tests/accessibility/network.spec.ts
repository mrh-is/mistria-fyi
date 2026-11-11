import { readFileSync } from "node:fs";

import { expect, isolateNetwork, test } from "../browser/test.js";
import { gotoApplication } from "./support/application-state.js";

for (const { catalog, warmShared } of [
  { catalog: "shared.0", warmShared: false },
  { catalog: "route.2", warmShared: false },
  { catalog: "route.2", warmShared: true },
]) {
  test(`recovers in Spanish when the ${catalog} catalog is unavailable (${warmShared ? "warm" : "cold"} shared copy)`, async ({
    page,
  }) => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../../.svelte-kit/output/client/.vite/manifest.json", import.meta.url),
        "utf8",
      ),
    ) as Record<string, { file: string }>;
    const { file } = manifest[`src/lib/i18n/catalogs/.wuchale/${catalog}.es.compiled.js`];
    let blocked = false;
    await page.route(`**/${file}`, (route) => {
      blocked = true;
      return route.abort();
    });

    if (warmShared) {
      await gotoApplication(page, "/es");
      await page.getByRole("button", { exact: true, name: "Ajustes rápidos" }).click();
      await page.getByRole("link", { exact: true, name: "Datos" }).click();
    } else {
      await page.goto("/es/data");
    }
    await expect(
      page.getByText("Algo ha fallado por nuestra parte, pero tu progreso está a salvo."),
    ).toBeVisible();
    expect(blocked).toBe(true);

    await page.unroute(`**/${file}`);
    const home = page.getByRole("link", { name: "Volver al inicio" });
    await expect(home).toHaveAttribute("href", "/es");
    await home.click();
    await expect(page).toHaveURL(/\/es$/u);
    await expect(page.getByRole("button", { exact: true, name: "Ajustes rápidos" })).toBeVisible();
  });
}

test.describe("privacy disclosure", () => {
  // Turnstile is disclosed for specific actions, so a fresh page must not load it.
  // Bypass CSP so the guard can observe resources that production CSP would block.
  test.use({ allowTurnstile: false, bypassCSP: true });

  test("the privacy page loads without undisclosed third-party requests", async ({ page }) => {
    await gotoApplication(page, "/en/privacy");
    await expect(page.getByRole("heading", { exact: true, name: "Privacy policy" })).toBeVisible();
    await page.waitForLoadState("load");
  });
});

test("serves sprites with their native dimensions without the CDN", async ({ page }) => {
  await page.setContent(`<img alt="Sprite fixture" src="https://assets.mistria.fyi/sprites/items/apple.webp?g=1">
    <img alt="Sprite fixture" src="https://assets.mistria.fyi/sprites/villagers/adeline.webp?g=1">`);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.images, (image) => [image.naturalWidth, image.naturalHeight]),
      ),
    )
    .toEqual([
      [18, 18],
      [24, 20],
    ]);
});

test("blocks unknown internet origins and detects page-route overrides", async ({
  baseURL,
  browser,
}) => {
  if (baseURL === undefined) throw new Error("A baseURL is required");
  const context = await browser.newContext();
  try {
    const unexpectedRequests = await isolateNetwork(context, baseURL);
    const page = await context.newPage();
    await page.setContent("<p>Network guard probe</p>");
    const blockedUrl = "https://example.invalid/blocked";
    expect(
      await page.evaluate(async (url) => {
        try {
          await fetch(url);
          return false;
        } catch {
          return true;
        }
      }, blockedUrl),
    ).toBe(true);
    // Page routes take precedence over context routes. The request observer still catches them.
    const overrideUrl = "https://example.invalid/override";
    await page.route(overrideUrl, (route) =>
      route.fulfill({
        body: "local override",
        headers: { "access-control-allow-origin": "*" },
      }),
    );
    await page.evaluate(async (url) => {
      await fetch(url);
    }, overrideUrl);
    expect(unexpectedRequests()).toEqual([blockedUrl, overrideUrl]);
  } finally {
    await context.close();
  }
});
