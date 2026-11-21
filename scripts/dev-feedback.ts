import "#scripts/lib/require-pinned-node";

import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

import { pnpmCommand } from "#scripts/lib/pnpm-command";

const repoRoot = path.resolve(import.meta.dirname, "..");

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
  return await new Promise((resolve) => {
    const child = spawn(pnpm.command, pnpm.args, {
      cwd: repoRoot,
      env,
      shell: pnpm.shell,
      stdio: "inherit",
    });
    child.on("close", (code) => {
      rmSync(path.join(repoRoot, ".dev.vars"), { force: true });
      resolve(code ?? 1);
    });
    child.on("error", (error) => {
      rmSync(path.join(repoRoot, ".dev.vars"), { force: true });
      console.error(error.message);
      resolve(1);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  process.exitCode = await startFeedbackDev();
}
