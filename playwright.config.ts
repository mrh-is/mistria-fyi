import { defineConfig, devices } from "@playwright/test";

import { assessPreviewProbe, probePreviewOwner } from "./scripts/playwright-preview-owner.js";

const isCi = process.env.CI === "true";
const worktreePortOffset = [...process.cwd()].reduce(
  (hash, character) => (hash * 31 + (character.codePointAt(0) ?? 0)) % 10_000,
  0,
);
const testPort = process.env.PLAYWRIGHT_PORT ?? String(40_000 + worktreePortOffset);
const testUrl = `http://127.0.0.1:${testPort}`;

// Playwright would also refuse a busy port (`reuseExistingServer: false`), but only with a generic
// message. Naming the checkout that owns the server makes a worktree collision obvious. This runs
// at config load because `webServer` starts before `globalSetup`, and only in the runner process:
// workers reload the config after the server is up. See #330.
if (process.env.TEST_WORKER_INDEX === undefined) {
  const previewConflict = assessPreviewProbe(probePreviewOwner(testUrl), testUrl, process.cwd());
  if (previewConflict !== null) throw new Error(previewConflict);
}

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
    command: "pnpm exec tsx scripts/playwright-preview.ts",
    env: { PLAYWRIGHT_PREVIEW_PORT: testPort },
    reuseExistingServer: false,
    timeout: 120_000,
    // A bare "/" 404s without an Accept-Language header (no unprefixed default locale), and
    // Playwright's readiness probe sends none — check a locale-prefixed path instead.
    url: `${testUrl}/en`,
  },
  workers: isCi ? 4 : undefined,
});
