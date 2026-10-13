// Sets up an existing linked worktree per AGENTS.md, Worktrees: links the `.worktreeinclude` entries from
// the main checkout, then installs dependencies. `worktree:new` runs it after creating a worktree;
// run it directly inside a harness-created worktree (e.g. under `.claude/worktrees/`).
// Usage: node scripts/setup-worktree.ts (not a pnpm script: `pnpm run` refuses to start without the
// dependencies this installs). It runs on the shell's Node, which may differ from the pin, so it
// skips the require-pinned-node guard: the install it runs downloads the pinned runtime, and every
// later step goes through pnpm, which uses that runtime.
//
// This is a Node script rather than a shell script so it behaves the same under Windows, where
// `bash` from `cmd.exe` can resolve to WSL and Git Bash's `ln -s` copies instead of linking (#353).
import { spawnSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { pnpmCommand } from "#scripts/lib/pnpm-command";

import type { SpawnSyncOptions } from "node:child_process";

const CODEX_STORE_DIR = "/private/tmp/codex-pnpm-store";

export interface LinkPlan {
  destination: string;
  directory: boolean;
  source: string;
}

export interface InstallPlan {
  env: Record<string, string>;
  installArgs: string[];
}

/**
 * Resolves `.worktreeinclude` lines to the main-checkout entries that exist and aren't already in
 * the worktree. A trailing `/` names a directory; other lines name files, with `*` & `?` globs in
 * their last segment (e.g. `.env.*`). Missing sources are skipped rather than linked dangling.
 */
export function planLinks(repoRoot: string, worktreeDir: string, patterns: string[]): LinkPlan[] {
  const plans: LinkPlan[] = [];
  for (const line of patterns) {
    const pattern = line.trim();
    if (!pattern || pattern.startsWith("#")) {
      continue;
    }
    const directory = pattern.endsWith("/");
    const relativePaths = directory
      ? [posix.join(pattern, ".")]
      : expandFilePattern(repoRoot, pattern);
    for (const relativePath of relativePaths) {
      const source = join(repoRoot, relativePath);
      const destination = join(worktreeDir, relativePath);
      // Skip files the checkout already tracks (e.g. `.env.example` matches `.env.*`) and entries
      // the harness already copied or a previous run already linked.
      if (existsSync(source) && !pathExists(destination)) {
        plans.push({ destination, directory, source });
      }
    }
  }
  return plans;
}

function expandFilePattern(repoRoot: string, pattern: string): string[] {
  const parent = posix.dirname(pattern);
  const name = posix.basename(pattern);
  if (!/[*?]/.test(name)) {
    return [pattern];
  }
  const matcher = new RegExp(
    `^${name
      .replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`)
      .replaceAll("*", ".*")
      .replaceAll("?", ".")}$`,
  );
  try {
    return readdirSync(join(repoRoot, parent))
      .filter((entry) => matcher.test(entry))
      .toSorted()
      .map((entry) => posix.join(parent, entry));
  } catch {
    return [];
  }
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Links one entry. Windows directory links are junctions, which need neither administrator rights
 * nor Developer Mode. Windows file symlinks do need one of those, so a refused file symlink falls
 * back to a hard link (same volume as the main checkout).
 */
export function linkEntry(plan: LinkPlan, platform: NodeJS.Platform = process.platform): void {
  mkdirSync(dirname(plan.destination), { recursive: true });
  if (plan.directory) {
    symlinkSync(plan.source, plan.destination, platform === "win32" ? "junction" : "dir");
    return;
  }
  try {
    symlinkSync(plan.source, plan.destination, "file");
  } catch (error) {
    if (platform !== "win32" || (error as NodeJS.ErrnoException).code !== "EPERM") {
      throw error;
    }
    linkSync(plan.source, plan.destination);
  }
}

/**
 * Local Codex retries may cross the sandbox boundary, where pnpm's default store changes. Pin both
 * install & prepare, preserving an explicit external-store override. Do not change cloud/CI or
 * other developers' pnpm settings.
 */
export function planInstall(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): InstallPlan {
  if (platform !== "darwin" || !env.CODEX_THREAD_ID) {
    return { env: {}, installArgs: ["install", "--frozen-lockfile"] };
  }
  // An empty override counts as unset, as `${var:-default}` did in the earlier shell script.
  const storeDir =
    [env.pnpm_config_store_dir, env.npm_config_store_dir].find(Boolean) ?? CODEX_STORE_DIR;
  return {
    env: {
      npm_config_store_dir: storeDir,
      // Only this isolated worktree can have its modules replaced after an earlier failed setup.
      pnpm_config_confirm_modules_purge: "false",
      pnpm_config_store_dir: storeDir,
    },
    installArgs: [
      "install",
      "--frozen-lockfile",
      "--store-dir",
      storeDir,
      "--config.confirmModulesPurge=false",
    ],
  };
}

function runPnpm(pnpmArgs: string[], options: SpawnSyncOptions): number {
  const { args, command, shell } = pnpmCommand(pnpmArgs);
  const result = spawnSync(command, args, { ...options, shell });
  if (result.error) {
    console.error(`Could not start pnpm: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function git(...args: string[]): string {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function main(): number {
  const worktreeDir = resolve(git("rev-parse", "--show-toplevel"));
  // `git worktree list` lists the main worktree first.
  const repoRoot = resolve(
    (git("worktree", "list", "--porcelain").split("\n")[0] ?? "").replace(/^worktree /, ""),
  );
  if (worktreeDir === repoRoot) {
    console.error(`error: ${worktreeDir} is the main checkout; run this inside a linked worktree.`);
    return 1;
  }

  const patterns = readFileSync(join(repoRoot, ".worktreeinclude"), "utf8").split(/\r?\n/);
  for (const plan of planLinks(repoRoot, worktreeDir, patterns)) {
    linkEntry(plan);
  }

  const install = planInstall(process.platform, process.env);
  const options: SpawnSyncOptions = {
    cwd: worktreeDir,
    env: { ...process.env, ...install.env },
    stdio: "inherit",
  };
  const status = runPnpm(install.installArgs, options);
  return status === 0 ? runPnpm(["run", "prepare"], options) : status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
