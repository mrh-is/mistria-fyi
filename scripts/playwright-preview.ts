// Playwright `webServer` command: builds unless PLAYWRIGHT_SKIP_BUILD is set, stamps this
// checkout's fingerprint into the build output, then serves it with `vite preview`. The
// fingerprint lets another run's config refuse this server instead of silently testing the wrong
// checkout (see `playwright-preview-owner.ts` and #330).
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { OWNER_FILE } from "./playwright-preview-owner";

import type { PreviewOwner } from "./playwright-preview-owner";

const checkout = process.cwd();
const port = process.env.PLAYWRIGHT_PREVIEW_PORT;
if (port === undefined) throw new Error("PLAYWRIGHT_PREVIEW_PORT is required.");

if (process.env.PLAYWRIGHT_SKIP_BUILD !== "true") {
  const build = spawnSync("pnpm", ["run", "build"], { stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

// `vite preview` serves `.svelte-kit/output/client` as the static root.
const clientDir = path.join(checkout, ".svelte-kit", "output", "client");
mkdirSync(clientDir, { recursive: true });
const owner: PreviewOwner = { checkout, startedAt: new Date().toISOString() };
writeFileSync(path.join(clientDir, OWNER_FILE), JSON.stringify(owner));

const preview = spawn("pnpm", ["run", "preview", "--host", "127.0.0.1", "--port", port], {
  stdio: "inherit",
});
preview.on("exit", (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => preview.kill(signal));
}
