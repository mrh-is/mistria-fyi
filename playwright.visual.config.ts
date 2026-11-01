import "#scripts/lib/require-pinned-node";

import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

import accessibility from "./playwright.config.js";

const revision = process.env.VISUAL_REVISION ?? "head";
if (!["base", "head"].includes(revision)) throw new Error("VISUAL_REVISION must be base or head");

export default defineConfig({
  ...accessibility,
  fullyParallel: true,
  outputDir: `.playwright-artifacts/visual/${revision}/test-results`,
  repeatEach: 2,
  reporter: [
    ["line"],
    ["json", { outputFile: `.playwright-artifacts/visual/${revision}/results.json` }],
  ],
  retries: 0,
  testDir: "tests/visual",
  use: { ...accessibility.use, reducedMotion: "reduce", screenshot: "off", trace: "off" },
  webServer: {
    ...accessibility.webServer,
    cwd: resolve(process.env.VISUAL_APP_DIRECTORY ?? "."),
  },
  workers: 2,
});
