// Playwright `webServer` command: builds unless PLAYWRIGHT_SKIP_BUILD is set, stamps this
// checkout's fingerprint into the build output, then serves it with `vite preview`. The
// fingerprint lets another run's config refuse this server instead of silently testing the wrong
// checkout (see `playwright-preview-owner.ts` and #330).
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { OWNER_FILE } from "./playwright-preview-owner.js";

import type { PreviewOwner } from "./playwright-preview-owner.js";

const checkout = process.cwd();
const port = process.env.PLAYWRIGHT_PREVIEW_PORT;
if (port === undefined) throw new Error("PLAYWRIGHT_PREVIEW_PORT is required.");

let buildStatus = 0;
if (process.env.PLAYWRIGHT_SKIP_BUILD !== "true") {
  buildStatus = spawnSync("pnpm", ["run", "build"], { stdio: "inherit" }).status ?? 1;
}

function servePreview(previewPort: string): void {
  // `vite preview` serves `.svelte-kit/output/client` as the static root.
  const clientDir = path.join(checkout, ".svelte-kit", "output", "client");
  mkdirSync(clientDir, { recursive: true });
  const owner: PreviewOwner = { checkout, startedAt: new Date().toISOString() };
  writeFileSync(path.join(clientDir, OWNER_FILE), JSON.stringify(owner));

  const preview = spawn("pnpm", ["run", "preview", "--host", "127.0.0.1", "--port", previewPort], {
    stdio: "inherit",
  });
  preview.on("exit", (code, signal) => {
    if (signal !== null) process.kill(process.pid, signal);
    process.exitCode = code ?? 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => preview.kill(signal));
  }
}

if (buildStatus === 0) {
  servePreview(port);
} else {
  process.exitCode = buildStatus;
}
