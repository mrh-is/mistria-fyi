import "#scripts/lib/require-pinned-node";

import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

import { pnpmCommand } from "#scripts/lib/pnpm-command";

import type { ChildProcess } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");

type FeedbackDevChild = Pick<ChildProcess, "kill" | "on">;

interface SignalSource {
  off: (event: "exit" | NodeJS.Signals, listener: () => void) => SignalSource;
  on: (signal: NodeJS.Signals, listener: () => void) => SignalSource;
  once: (event: "exit", listener: () => void) => SignalSource;
}

export async function waitForFeedbackDev(
  child: FeedbackDevChild,
  cleanup: () => void,
  signals: SignalSource = process,
): Promise<number> {
  return await new Promise((resolve) => {
    let finished = false;
    const finish = (code: number): void => {
      if (finished) return;
      finished = true;
      cleanup();
      signals.off("SIGINT", onSigint);
      signals.off("SIGTERM", onSigterm);
      resolve(code);
    };
    const onSigint = (): void => {
      child.kill("SIGINT");
    };
    const onSigterm = (): void => {
      child.kill("SIGTERM");
    };
    signals.on("SIGINT", onSigint);
    signals.on("SIGTERM", onSigterm);
    signals.once("exit", cleanup);
    child.on("close", (code, signal) => {
      if (code !== null) {
        finish(code);
      } else if (signal === "SIGINT") {
        finish(130);
      } else if (signal === "SIGTERM") {
        finish(143);
      } else {
        finish(1);
      }
      signals.off("exit", cleanup);
    });
    child.on("error", (error) => {
      console.error(error.message);
      finish(1);
      signals.off("exit", cleanup);
    });
  });
}

export async function startFeedbackDev(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const injected = spawnSync(
    "op-agent",
    ["inject", "-i", ".dev.vars.op", "-o", ".dev.vars", "-f"],
    { cwd: repoRoot, env, stdio: "inherit" },
  );
  if (injected.error && (injected.error as NodeJS.ErrnoException).code === "ENOENT") {
    console.error("op-agent is not installed; see docs/machine-setup.md.");
    return 1;
  }
  if (injected.status !== 0) {
    return injected.status ?? 1;
  }

  const pnpm = pnpmCommand(["exec", "vite", "dev"], env);
  const child = spawn(pnpm.command, pnpm.args, {
    cwd: repoRoot,
    env,
    shell: pnpm.shell,
    stdio: "inherit",
  });
  return await waitForFeedbackDev(child, () => {
    rmSync(path.join(repoRoot, ".dev.vars"), { force: true });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  process.exitCode = await startFeedbackDev();
}
