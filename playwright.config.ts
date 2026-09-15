import { defineConfig, devices } from "@playwright/test";

const isCi = process.env.CI === "true";
const skipBuild = process.env.PLAYWRIGHT_SKIP_BUILD === "true";
const worktreePortOffset = [...process.cwd()].reduce(
  (hash, character) => (hash * 31 + character.charCodeAt(0)) % 10_000,
  0,
);
const testPort = process.env.PLAYWRIGHT_PORT ?? String(40_000 + worktreePortOffset);
const testUrl = `http://127.0.0.1:${testPort}`;

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
    baseURL: testUrl,
    locale: "en-US",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    timezoneId: "UTC",
    trace: "retain-on-failure",
    viewport: { height: 720, width: 1280 },
  },
  webServer: {
    command: skipBuild
      ? `pnpm run preview --host 127.0.0.1 --port ${testPort}`
      : `pnpm run build && pnpm run preview --host 127.0.0.1 --port ${testPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
    url: testUrl,
  },
  workers: isCi ? 4 : undefined,
});
