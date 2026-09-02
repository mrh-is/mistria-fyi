import { defineConfig, devices } from "@playwright/test";

const isCi = process.env.CI === "true";

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  forbidOnly: isCi,
  fullyParallel: true,
  outputDir: ".playwright-results",
  reporter: isCi
    ? [
        ["github"],
        ["line"],
        ["html", { open: "never", outputFolder: ".playwright-report" }],
        ["json", { outputFile: ".playwright-artifacts/results.json" }],
      ]
    : [["line"], ["html", { open: "never", outputFolder: ".playwright-report" }]],
  retries: isCi ? 1 : 0,
  testDir: "tests/accessibility",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4173",
    locale: "en-US",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    timezoneId: "UTC",
    trace: "retain-on-failure",
    viewport: { height: 720, width: 1280 },
  },
  webServer: {
    command: "pnpm run build && pnpm run preview --host 127.0.0.1 --port 4173",
    reuseExistingServer: !isCi,
    timeout: 120_000,
    url: "http://127.0.0.1:4173",
  },
  workers: isCi ? 2 : undefined,
});
