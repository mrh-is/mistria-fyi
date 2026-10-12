// Playwright `webServer` command: builds unless PLAYWRIGHT_SKIP_BUILD is set, stamps this
// checkout's fingerprint into the build output, then serves it with `vite preview`. The
// fingerprint lets another run's config refuse this server instead of silently testing the wrong
// checkout (see `playwright-preview-owner.ts` and #330).
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { pnpmCommand } from "#scripts/lib/pnpm-command";

import { OWNER_FILE } from "./playwright-preview-owner.js";

import type { ChildProcess } from "node:child_process";

import type { PreviewOwner } from "./playwright-preview-owner.js";

export interface PreviewOptions {
  args?: string[];
  checkout: string;
  command?: string;
  port: string;
  probeIntervalMs?: number;
  skipBuild: boolean;
}

export function runPreview(options: PreviewOptions): ChildProcess | undefined {
  const { checkout, port, skipBuild } = options;
  const started = Date.now();
  const artifacts = path.join(checkout, ".playwright-artifacts");
  mkdirSync(artifacts, { recursive: true });
  const logFile = path.join(artifacts, `preview-${port}.log`);
  writeFileSync(logFile, "");
  function log(event: string, details: object = {}): void {
    const line = `${JSON.stringify({ elapsedMs: Date.now() - started, event, ...details })}\n`;
    appendFileSync(logFile, line);
    process.stderr.write(`[preview] ${line}`);
  }

  log("start", { checkout, node: process.version, port, skipBuild });
  if (!skipBuild) {
    log("build-start");
    const pnpm = pnpmCommand(["run", "build"]);
    const build = spawnSync(pnpm.command, pnpm.args, {
      cwd: checkout,
      shell: pnpm.shell,
      stdio: "inherit",
    });
    log("build-exit", { code: build.status, error: build.error?.message, signal: build.signal });
    if (build.status !== 0) {
      process.exitCode = build.status ?? 1;
      return undefined;
    }
  }

  // `vite preview` serves `.svelte-kit/output/client` as the static root.
  const clientDir = path.join(checkout, ".svelte-kit", "output", "client");
  mkdirSync(clientDir, { recursive: true });
  const owner: PreviewOwner = { checkout, startedAt: new Date().toISOString() };
  writeFileSync(path.join(clientDir, OWNER_FILE), JSON.stringify(owner));

  const { args, command, shell } = options.command
    ? { args: options.args ?? [], command: options.command, shell: false }
    : pnpmCommand(["run", "preview", "--host", "127.0.0.1", "--port", port]);
  log("spawn", { args, command });
  const preview = spawn(command, args, { cwd: checkout, shell, stdio: ["ignore", "pipe", "pipe"] });
  for (const [stream, output] of [
    [preview.stdout, process.stdout],
    [preview.stderr, process.stderr],
  ] as const) {
    stream.on("data", (chunk: Buffer) => {
      appendFileSync(logFile, chunk);
      output.write(chunk);
    });
  }
  preview.on("spawn", () => {
    log("spawned", { pid: preview.pid });
  });

  let lastProbe = "not probed";
  let stopped = false;
  let probing = false;
  const url = `http://127.0.0.1:${port}/en`;
  async function probe(): Promise<void> {
    if (stopped || probing) return;
    probing = true;
    let result: string;
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2000) });
      result = `HTTP ${String(response.status)}`;
      await response.body?.cancel();
    } catch (error) {
      const cause = error instanceof Error ? error.cause : undefined;
      result =
        error instanceof Error
          ? `${error.message}${cause instanceof Error ? `: ${cause.message}` : ""}`
          : String(error);
    }
    probing = false;
    if (!stopped) {
      lastProbe = result;
      log("readiness-probe", { pid: preview.pid, result, url });
    }
  }
  const timer = setInterval(() => {
    void probe();
  }, options.probeIntervalMs ?? 5000);
  void probe();
  function stop(signal: NodeJS.Signals): void {
    log("shutdown", { lastProbe, pid: preview.pid, signal });
    preview.kill(signal);
  }
  const interrupt = () => {
    stop("SIGINT");
  };
  const terminate = () => {
    stop("SIGTERM");
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  function cleanup(): void {
    stopped = true;
    clearInterval(timer);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
  preview.on("error", (error) => {
    cleanup();
    log("spawn-error", { error: error.message });
    process.exitCode = 1;
  });
  preview.on("exit", (code, signal) => {
    cleanup();
    log("exit", { code, lastProbe, signal });
  });
  return preview;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = process.env.PLAYWRIGHT_PREVIEW_PORT;
  if (port === undefined) throw new Error("PLAYWRIGHT_PREVIEW_PORT is required.");
  const preview = runPreview({
    checkout: process.cwd(),
    port,
    skipBuild: process.env.PLAYWRIGHT_SKIP_BUILD === "true",
  });
  // `exit` can precede pipe draining. Preserve the complete crash tail before relaying a signal.
  preview?.on("close", (code, signal) => {
    if (signal !== null) process.kill(process.pid, signal);
    process.exitCode = code ?? 1;
  });
}
