import { expect, isolateNetwork, test } from "../browser/test.js";
import { gotoApplication } from "./support/application-state.js";

test.describe("privacy disclosure", () => {
  // Turnstile is disclosed for specific actions, so a fresh page must not load it.
  // Bypass CSP so the guard can observe resources that production CSP would block.
  test.use({ allowTurnstile: false, bypassCSP: true });

  test("the privacy page loads without undisclosed third-party requests", async ({ page }) => {
    await gotoApplication(page, "/en/privacy");
    await expect(page.getByRole("heading", { exact: true, name: "Privacy Policy" })).toBeVisible();
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
