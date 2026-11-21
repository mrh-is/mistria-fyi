import "#scripts/lib/require-pinned-node";

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";

import { loadOpSecrets } from "#scripts/lib/op-agent";
import { pnpmCommand } from "#scripts/lib/pnpm-command";

const repoRoot = path.resolve(import.meta.dirname, "..");

export async function startDev(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const template = await readFile(path.join(repoRoot, ".env.op"), "utf8");
  const values = Object.fromEntries(
    Object.entries(parseEnv(template)).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  await loadOpSecrets(values, env);
  const pnpm = pnpmCommand(["exec", "vite", "dev"], env);
  return await new Promise((resolve) => {
    const child = spawn(pnpm.command, pnpm.args, {
      cwd: repoRoot,
      env,
      shell: pnpm.shell,
      stdio: "inherit",
    });
    child.on("error", (error) => {
      console.error(error.message);
      resolve(1);
    });
    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  process.exitCode = await startDev();
}
