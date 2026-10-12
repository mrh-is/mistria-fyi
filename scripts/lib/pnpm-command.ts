/** A process to spawn that runs pnpm with the given arguments. */
export interface PnpmCommand {
  args: string[];
  command: string;
  shell: boolean;
}

/**
 * Resolves pnpm without depending on a shell shim: `pnpm run` & `pnpm exec` export pnpm's own
 * executable as `npm_execpath`, which avoids PowerShell's `pnpm.ps1` & Node's refusal to spawn
 * `pnpm.cmd` without a shell on Windows.
 *
 * Scripts import this as `#scripts/lib/pnpm-command`: plain `node` won't resolve a `.js` specifier
 * to its `.ts` source, so `package.json`'s `#scripts/*` entry maps to the `.ts` file directly.
 */
export function pnpmCommand(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): PnpmCommand {
  const execPath = env.npm_execpath;
  if (!execPath) {
    return { args, command: "pnpm", shell: platform === "win32" };
  }
  if (/\.[cm]?js$/.test(execPath)) {
    return { args: [execPath, ...args], command: process.execPath, shell: false };
  }
  return { args, command: execPath, shell: false };
}
