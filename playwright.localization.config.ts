import { defineConfig } from "@playwright/test";

import browserConfig from "./playwright.config.js";

export default defineConfig({
  ...browserConfig,
  outputDir: ".playwright-results/localization",
  reporter: "line",
  testDir: "tests/localization",
});
