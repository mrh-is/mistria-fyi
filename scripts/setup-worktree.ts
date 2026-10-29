// Sets up an existing linked worktree per AGENTS.md, Worktrees: links the shared directories & the
// `.worktreeinclude` entries from the main checkout, then installs dependencies. `worktree:new` runs it after creating a worktree;
// run it directly inside a harness-created worktree (e.g. under `.claude/worktrees/`).
// Usage: node scripts/setup-worktree.ts (not a pnpm script: `pnpm run` refuses to start without the
// dependencies this installs). Agent SessionStart hooks run it with `--session-start`, which only
// fills in what's absent or stale, also covers the main checkout's dependencies, sends tool output
// to stderr, & reports the outcome as session context. Claude Code's `FileChanged` & `CwdChanged`
// hooks run it with `--file-changed` & `--cwd-changed` to keep a session current after a lockfile
// change or a move into another checkout; see docs/agent-reference.md.
// It runs on the shell's Node, which may differ from the pin, so it skips the require-pinned-node
// guard: the install it runs downloads the pinned runtime, and every
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
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { contextOutput } from "#scripts/lib/agent-hook";
import { pnpmCommand } from "#scripts/lib/pnpm-command";

import type { SpawnSyncOptions } from "node:child_process";

import type { HookInput } from "#scripts/lib/agent-hook";

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
 * Read-only directories every worktree links from the main checkout. They stay out of
 * `.worktreeinclude`, which harnesses such as Claude Code copy into new worktrees, so the game
 * assets are never duplicated.
 */
export const SHARED_DIRECTORIES = ["pipeline/input/"];

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
  const storeDir = env.pnpm_config_store_dir;
  if (!storeDir) {
    throw new Error(
      "pnpm_config_store_dir is unset. Set shell_environment_policy.set.pnpm_config_store_dir and sandbox_workspace_write.writable_roots in user-level ~/.codex/config.toml; see docs/machine-setup.md, Codex shells",
    );
  }
  return {
    env: {
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

export type Mode = "cwd-changed" | "file-changed" | "manual" | "session-start";

/** Files whose change can make installed dependencies stale; also the `FileChanged` matcher. */
export const MANIFESTS = ["pnpm-lock.yaml", "package.json", "pnpm-workspace.yaml"];

export function modeOf(argv: string[]): Mode {
  if (argv.includes("--session-start")) {
    return "session-start";
  }
  if (argv.includes("--file-changed")) {
    return "file-changed";
  }
  return argv.includes("--cwd-changed") ? "cwd-changed" : "manual";
}

/**
 * The hook's stdin. Claude Code runs hooks from the session's original checkout, so a worktree
 * the session moves into arrives only as `cwd`, `new_cwd`, or `file_path`. A manual run has no
 * input.
 */
function hookInput(): HookInput {
  if (process.stdin.isTTY) {
    return {};
  }
  const text = readFileSync(0, "utf8").trim();
  return text === "" ? {} : (JSON.parse(text) as HookInput);
}

function tryGit(cwd: string, ...args: string[]): string | undefined {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function toplevelOf(directory: string): string | undefined {
  const top = tryGit(directory, "rev-parse", "--show-toplevel");
  return top === undefined ? undefined : realpathSync(top);
}

function commonDirOf(directory: string): string | undefined {
  const common = tryGit(directory, "rev-parse", "--path-format=absolute", "--git-common-dir");
  return common === undefined ? undefined : realpathSync(common);
}

/** Whether `directory` is a checkout (main or linked) of the repository holding `origin`. */
export function sameRepository(origin: string, directory: string): boolean {
  const target = commonDirOf(directory);
  return target !== undefined && target === commonDirOf(origin);
}

export interface EventTarget {
  /** The checkout to set up; absent when the event needs no setup. */
  directory?: string;
  /** Absolute manifest paths of the checkout the session now works in (`CwdChanged` only). */
  watchPaths?: string[];
}

/** Absolute paths of the existing dependency manifests in a checkout. */
export function manifestPaths(toplevel: string): string[] {
  return MANIFESTS.map((name) => join(toplevel, name)).filter((path) => existsSync(path));
}

/**
 * Decides what a `FileChanged` or `CwdChanged` event asks for. `FileChanged` acts only on a
 * manifest at the root of a checkout of this repository, so a nested or foreign `package.json`
 * does nothing. `CwdChanged` sets up the checkout only when the move crosses into a different one
 * (a `cd` within a checkout changes nothing), & always hands back that checkout's manifests so the
 * `FileChanged` watch follows the session.
 */
export function resolveEvent(
  mode: "cwd-changed" | "file-changed",
  input: HookInput,
  origin: string,
): EventTarget {
  if (mode === "file-changed") {
    const file = input.file_path;
    if (!file || input.event === "unlink" || !MANIFESTS.includes(basename(file))) {
      return {};
    }
    const directory = dirname(file);
    if (!existsSync(directory) || toplevelOf(directory) !== realpathSync(directory)) {
      return {};
    }
    return sameRepository(origin, directory) ? { directory } : {};
  }
  const next = input.new_cwd;
  const top =
    next && existsSync(next) && sameRepository(origin, next) ? toplevelOf(next) : undefined;
  if (!top) {
    return { watchPaths: [] };
  }
  const previous =
    input.old_cwd && existsSync(input.old_cwd) ? toplevelOf(input.old_cwd) : undefined;
  return { directory: previous === top ? undefined : top, watchPaths: manifestPaths(top) };
}

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function lockOwner(lock: string): number {
  try {
    return Number(readFileSync(join(lock, "pid"), "utf8").trim());
  } catch {
    return 0;
  }
}

/**
 * Serializes automatic setups of one checkout (session start, a lockfile change, & a move into it
 * can overlap) with a lock directory in the checkout's own git directory. A lock whose owner is
 * gone is taken over. `work` re-probes, so a waiter finds the job done. This cannot stop the
 * agent's own pnpm command from racing an install; such a command fails with pnpm's
 * stale-dependency error, & the install finishes regardless.
 */
export function withSetupLock<T>(lockRoot: string, work: () => T, timeoutMs = 300_000): T {
  const lock = join(lockRoot, "mistria-setup.lock");
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      const owner = lockOwner(lock);
      if (owner <= 0 || !processAlive(owner)) {
        // A just-created lock has no pid yet; give its owner a moment before declaring it stale.
        sleep(100);
        if (lockOwner(lock) <= 0 || !processAlive(lockOwner(lock))) {
          const stale = `${lock}.stale-${process.pid}`;
          try {
            renameSync(lock, stale);
            rmSync(stale, { force: true, recursive: true });
          } catch {
            // Another waiter took it over first; loop back to mkdir.
          }
        }
      } else if (Date.now() > deadline) {
        throw new Error(`timed out waiting for another setup (pid ${owner}) in ${lockRoot}`, {
          cause: error,
        });
      } else {
        sleep(250);
      }
    }
  }
  try {
    writeFileSync(join(lock, "pid"), String(process.pid));
    return work();
  } finally {
    rmSync(lock, { force: true, recursive: true });
  }
}

/**
 * pnpm's own `verifyDepsBeforeRun` check: `pnpm exec` refuses to start when dependencies are
 * absent or stale (a lockfile or workspace change since the last install).
 */
function dependenciesCurrent(cwd: string): boolean {
  return runPnpm(["exec", "node", "--version"], { cwd, stdio: "ignore" }) === 0;
}

export interface SetupResult {
  installed: boolean;
  linked: number;
  status: number;
}

/**
 * Links the absent shared & `.worktreeinclude` entries, & installs dependencies. For hooks
 * (`quiet`), the main checkout gets dependencies only, and dependencies install only when absent
 * or stale, so a current checkout is left alone.
 */
function main(quiet: boolean): SetupResult {
  const worktreeDir = resolve(git("rev-parse", "--show-toplevel"));
  // `git worktree list` lists the main worktree first.
  const repoRoot = resolve(
    (git("worktree", "list", "--porcelain").split("\n")[0] ?? "").replace(/^worktree /, ""),
  );
  const mainCheckout = worktreeDir === repoRoot;
  if (mainCheckout && !quiet) {
    console.error(`error: ${worktreeDir} is the main checkout; run this inside a linked worktree.`);
    return { installed: false, linked: 0, status: 1 };
  }

  const links = mainCheckout
    ? []
    : planLinks(repoRoot, worktreeDir, [
        ...SHARED_DIRECTORIES,
        ...readFileSync(join(repoRoot, ".worktreeinclude"), "utf8").split(/\r?\n/),
      ]);
  const installs =
    !quiet || !existsSync(join(worktreeDir, "node_modules")) || !dependenciesCurrent(worktreeDir);
  if (links.length === 0 && !installs) {
    return { installed: false, linked: 0, status: 0 };
  }
  const install = installs ? planInstall(process.platform, process.env) : undefined;
  for (const plan of links) {
    linkEntry(plan);
  }
  if (install) {
    const options: SpawnSyncOptions = {
      cwd: worktreeDir,
      env: { ...process.env, ...install.env },
      // Hook output is parsed as JSON on stdout, so keep install logs out of it.
      stdio: quiet ? ["ignore", 2, 2] : "inherit",
    };
    const installed = runPnpm(install.installArgs, options);
    const status = installed === 0 ? runPnpm(["run", "prepare"], options) : installed;
    if (status !== 0) {
      return { installed: false, linked: links.length, status };
    }
  }
  return { installed: install !== undefined, linked: links.length, status: 0 };
}

function describeSetup(directory: string, result: SetupResult): string {
  const steps = [
    ...(result.linked > 0 ? [`linked ${result.linked} entries from the main checkout`] : []),
    ...(result.installed ? ["installed dependencies with the frozen lockfile & ran prepare"] : []),
  ];
  return `Initialized ${directory} with node scripts/setup-worktree.ts: ${steps.join("; ")}.`;
}

/** Runs `main` under the checkout's setup lock, from inside that checkout. */
function lockedSetup(): SetupResult {
  const gitDir = tryGit(".", "rev-parse", "--absolute-git-dir");
  if (gitDir === undefined) {
    throw new Error("not inside a git checkout");
  }
  return withSetupLock(gitDir, () => main(true));
}

/**
 * Waits out a burst of manifest writes (`pnpm add` rewrites several) before a `FileChanged`
 * probe, so the install does not start in the middle of someone else's.
 */
function settleMilliseconds(): number {
  const value = Number(process.env.MISTRIA_SETUP_SETTLE_MS ?? 3000);
  return Number.isFinite(value) && value >= 0 ? value : 3000;
}

/**
 * Runs a `FileChanged` or `CwdChanged` hook. Its stdout is the hook's JSON output: `watchPaths`
 * (`CwdChanged`) & a `systemMessage` for the user when an install ran or failed. These events add
 * no context for the agent, which learns of a failure from the next pnpm command's own
 * stale-dependency error, & the frozen install is preauthorized. The hooks never fail.
 */
function runEvent(mode: "cwd-changed" | "file-changed"): void {
  const target = resolveEvent(mode, hookInput(), process.cwd());
  const output: {
    hookSpecificOutput?: { hookEventName: string; watchPaths: string[] };
    systemMessage?: string;
    watchPaths?: string[];
  } = {};
  if (mode === "cwd-changed") {
    const watchPaths = target.watchPaths ?? [];
    // The docs name the field without saying where it nests (SessionStart's lives under
    // `hookSpecificOutput`), so send both spellings; an unread one is ignored.
    output.watchPaths = watchPaths;
    output.hookSpecificOutput = { hookEventName: "CwdChanged", watchPaths };
  }
  const directory = target.directory;
  if (directory) {
    if (mode === "file-changed") {
      sleep(settleMilliseconds());
    }
    try {
      process.chdir(directory);
      const result = lockedSetup();
      if (result.status !== 0) {
        throw new Error(`exit status ${String(result.status)}`);
      }
      if (result.installed || result.linked > 0) {
        output.systemMessage = describeSetup(directory, result);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      output.systemMessage = `Automatic worktree setup failed in ${directory} (${reason}). Follow AGENTS.md, Tooling failures: rerun node scripts/setup-worktree.ts to see the error.`;
    }
  }
  if (Object.keys(output).length > 0) {
    console.log(JSON.stringify(output));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = modeOf(process.argv);
  if (mode === "file-changed" || mode === "cwd-changed") {
    try {
      runEvent(mode);
    } catch (error) {
      console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    const sessionStart = mode === "session-start";
    try {
      const cwd = sessionStart ? hookInput().cwd : undefined;
      if (cwd) {
        process.chdir(cwd);
      }
      const result = sessionStart ? lockedSetup() : main(false);
      process.exitCode = result.status;
      if (sessionStart && result.status === 0 && (result.installed || result.linked > 0)) {
        console.log(
          contextOutput(
            "SessionStart",
            describeSetup(resolve(git("rev-parse", "--show-toplevel")), result),
          ),
        );
      }
    } catch (error) {
      console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
    if (sessionStart && process.exitCode !== 0) {
      // A failed setup must not block the session; the agent stops & reports instead.
      console.log(
        contextOutput(
          "SessionStart",
          `Automatic worktree setup (node scripts/setup-worktree.ts --session-start) failed with exit status ${String(process.exitCode)}; its output is in the hook's stderr. Follow AGENTS.md, Tooling failures: report this before other work, then rerun node scripts/setup-worktree.ts to see the error.`,
        ),
      );
      process.exitCode = 0;
    }
  }
}
