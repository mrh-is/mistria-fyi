import { expect, test } from "../browser/test.js";
import {
  createStoredState,
  expectResolvedTheme,
  gotoApplication,
  gotoRenderedApplication,
  initializeApplication,
} from "./support/application-state.js";
import { openVisibilityPanel } from "./support/scenarios.js";

test.describe("@readiness application readiness", () => {
  test("navigation waits for hydration without waiting for unrelated requests", async ({
    page,
  }) => {
    const { promise: requestGate, resolve: releaseRequest } = Promise.withResolvers<undefined>();
    await page.route("**/readiness-pending", async (route) => {
      await requestGate;
      await route.fulfill({ body: "done" });
    });
    await page.route("**/readiness-fixture", (route) =>
      route.fulfill({
        body: '<html><body><button>Ready</button><script>fetch("/readiness-pending")</script></body></html>',
        contentType: "text/html",
      }),
    );

    let ready = false;
    const navigation = (async () => {
      await gotoApplication(page, "/readiness-fixture");
      ready = true;
    })();
    try {
      await expect(page.getByRole("button", { name: "Ready" })).toBeVisible();
      expect(ready).toBe(false);
      await page.evaluate(() => {
        document.documentElement.dataset.hydrated = "true";
      });
      await expect.poll(() => ready, { timeout: 2000 }).toBe(true);
    } finally {
      releaseRequest(undefined);
      await navigation;
    }
  });

  test("rendering waits for fonts and images after hydration", async ({ page }) => {
    const { promise: assetGate, resolve: releaseAssets } = Promise.withResolvers<undefined>();
    const requests = new Set<string>();
    await page.route(/\/(?:fonts\/petrona-latin\.woff2|icon-192\.png)$/, async (route) => {
      requests.add(route.request().resourceType());
      await assetGate;
      await route.continue();
    });
    await page.route("**/readiness-rendering", (route) =>
      route.fulfill({
        body: '<html data-hydrated="true"><style>@font-face{font-family:readiness;src:url(/fonts/petrona-latin.woff2)}body{font-family:readiness}</style><body>Ready<img src="/icon-192.png" width="192" height="192"></body></html>',
        contentType: "text/html",
      }),
    );

    let ready = false;
    const navigation = (async () => {
      await gotoRenderedApplication(page, "/readiness-rendering");
      ready = true;
    })();
    try {
      await expect.poll(() => [...requests].toSorted()).toEqual(["font", "image"]);
      expect(ready).toBe(false);
      releaseAssets(undefined);
      await navigation;
      expect(ready).toBe(true);
      expect(
        await page.getByRole("img").evaluate((image: HTMLImageElement) => image.naturalWidth),
      ).toBe(192);
      expect(await page.evaluate(() => document.fonts.status)).toBe("loaded");
    } finally {
      releaseAssets(undefined);
    }
  });

  test("interactive readiness includes restored state and theme", async ({ page }) => {
    await initializeApplication(
      page,
      "dark",
      createStoredState({ availabilityWindows: ["now", "anytime", "later"], showSpoilers: true }),
    );
    await gotoApplication(page, "/almanac");
    await expectResolvedTheme(page, "dark");
    await expect(
      page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed$/ }),
    ).toBeVisible();
    await openVisibilityPanel(page);
    await expect(page.getByRole("button", { exact: true, name: "Later" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
