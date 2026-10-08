import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

import { runPreview } from "./playwright-preview.js";

const directories: string[] = [];
afterEach(() => {
  process.exitCode = 0;
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function launch(source: string) {
  const checkout = mkdtempSync(join(tmpdir(), "mistria-preview-"));
  directories.push(checkout);
  const child = runPreview({
    args: ["-e", source],
    checkout,
    command: process.execPath,
    port: "4188",
    probeIntervalMs: 10,
    skipBuild: true,
  });
  if (!child) throw new Error("Preview did not spawn");
  return {
    child,
    read: () => readFileSync(join(checkout, ".playwright-artifacts/preview-4188.log"), "utf8"),
  };
}

it("captures subprocess output, readiness transitions, & exit status", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("connection refused"))
    .mockResolvedValue(new Response("ready", { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const preview = launch(
    "console.log('preview output'); console.error('preview error'); setTimeout(() => process.exit(7), 100)",
  );
  await once(preview.child, "close");
  expect(preview.read()).toContain("preview output");
  expect(preview.read()).toContain("preview error");
  expect(preview.read()).toContain("connection refused");
  expect(preview.read()).toContain("HTTP 200");
  expect(preview.read()).toContain('"code":7');
  expect(preview.read()).not.toContain("build-start");
  const probes = fetch.mock.calls.length;
  await new Promise((resolve) => {
    setTimeout(resolve, 30);
  });
  expect(fetch).toHaveBeenCalledTimes(probes);
});

it("records the last failed probe on graceful termination of a stalled preview", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
  const preview = launch("setInterval(() => {}, 1000)");
  await once(preview.child, "spawn");
  await new Promise((resolve) => {
    setTimeout(resolve, 30);
  });
  process.emit("SIGTERM");
  await once(preview.child, "close");
  expect(preview.read()).toContain('"event":"shutdown"');
  expect(preview.read()).toContain('"lastProbe":"connection refused"');
  expect(preview.read()).toContain('"signal":"SIGTERM"');
});

it("records spawn failures and clears the probe timer", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
  const checkout = mkdtempSync(join(tmpdir(), "mistria-preview-"));
  directories.push(checkout);
  const child = runPreview({
    checkout,
    command: join(checkout, "missing-command"),
    port: "4188",
    skipBuild: true,
  });
  if (!child) throw new Error("Expected a child handle");
  await new Promise<void>((resolve) => {
    child.on("close", () => {
      resolve();
    });
  });
  expect(readFileSync(join(checkout, ".playwright-artifacts/preview-4188.log"), "utf8")).toContain(
    '"event":"spawn-error"',
  );
  expect(process.exitCode).toBe(1);
});

it("records a failed build & does not start preview", () => {
  const checkout = mkdtempSync(join(tmpdir(), "mistria-preview-"));
  directories.push(checkout);
  writeFileSync(join(checkout, "pnpm"), "#!/bin/sh\nexit 9\n");
  chmodSync(join(checkout, "pnpm"), 0o755);
  vi.stubEnv("PATH", `${checkout}:${process.env.PATH ?? ""}`);
  expect(runPreview({ checkout, port: "4188", skipBuild: false })).toBeUndefined();
  const log = readFileSync(join(checkout, ".playwright-artifacts/preview-4188.log"), "utf8");
  expect(log).toContain('"event":"build-exit","code":9');
  expect(log).not.toContain('"event":"spawn"');
  expect(process.exitCode).toBe(9);
});

function cliFixture(source: string) {
  const checkout = mkdtempSync(join(tmpdir(), "mistria-preview-"));
  directories.push(checkout);
  writeFileSync(join(checkout, "child.cjs"), source);
  writeFileSync(join(checkout, "pnpm"), '#!/bin/sh\nexec "$PREVIEW_TEST_NODE" child.cjs\n');
  chmodSync(join(checkout, "pnpm"), 0o755);
  return {
    args: [
      "--import",
      import.meta.resolve("tsx"),
      new URL("playwright-preview.ts", import.meta.url).pathname,
    ],
    options: {
      cwd: checkout,
      env: {
        ...process.env,
        PATH: `${checkout}:${process.env.PATH ?? ""}`,
        PLAYWRIGHT_PREVIEW_PORT: "4188",
        PLAYWRIGHT_SKIP_BUILD: "true",
        PREVIEW_TEST_NODE: process.execPath,
      },
    },
    read: () => readFileSync(join(checkout, ".playwright-artifacts/preview-4188.log"), "utf8"),
  };
}

it("drains the complete subprocess crash tail before relaying its signal", () => {
  const fixture = cliFixture(
    'require("node:fs").writeSync(2, "x".repeat(262144)); process.kill(process.pid, "SIGTERM")',
  );
  const result = spawnSync(process.execPath, fixture.args, {
    ...fixture.options,
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(result.signal, result.stderr).toBe("SIGTERM");
  expect(fixture.read()).toContain("x".repeat(262_144));
});

it("leaves diagnostics on disk after Playwright-style process-group force-kill", async () => {
  const fixture = cliFixture('console.error("stalled preview"); setInterval(() => {}, 1000)');
  const child = spawn(process.execPath, fixture.args, {
    ...fixture.options,
    detached: true,
    stdio: "ignore",
  });
  try {
    await vi.waitFor(() => {
      expect(fixture.read()).toContain("stalled preview");
    });
  } finally {
    if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
    await once(child, "close");
  }
  expect(fixture.read()).toContain('"event":"readiness-probe"');
  expect(fixture.read()).not.toContain('"event":"shutdown"');
});
