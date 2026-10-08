import { defineConfig, devices } from "@playwright/test";

const isCi = process.env.CI === "true";
const port = 4188;

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  forbidOnly: isCi,
  fullyParallel: false,
  outputDir: ".playwright-pwa-results",
  reporter: isCi
    ? [["github"], ["line"], ["html", { open: "never", outputFolder: ".playwright-pwa-report" }]]
    : [["line"], ["html", { open: "never", outputFolder: ".playwright-pwa-report" }]],
  retries: isCi ? 1 : 0,
  testDir: "tests/pwa",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${String(port)}`,
    locale: "en-US",
    screenshot: "only-on-failure",
    serviceWorkers: "allow",
    timezoneId: "UTC",
    // CI captures retries, including recovered failures; local runs have no retries.
    trace: isCi ? "on-first-retry" : "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec tsx scripts/playwright-preview.ts",
    env: { PLAYWRIGHT_PREVIEW_PORT: String(port) },
    reuseExistingServer: false,
    timeout: 120_000,
    // A bare "/" 404s without an Accept-Language header (no unprefixed default locale), and
    // Playwright's readiness probe sends none — check a locale-prefixed path instead.
    url: `http://127.0.0.1:${String(port)}/en`,
  },
  workers: 1,
});
