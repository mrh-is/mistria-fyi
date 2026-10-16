import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from "node:child_process";

/**
 * Machine doctor: reports whether this machine meets the prerequisites in docs/machine-setup.md.
 * It is read-only. It never installs, configures, or authenticates, and it never reads credentials;
 * the login probes inspect an exit code only. Plain Node with no dependencies, so it runs before
 * `pnpm install` (and before pnpm exists): `node scripts/machine-doctor.ts`. There is deliberately no
 * pnpm script for it: `pnpm run` would verify (or install) dependencies first and substitute the
 * devEngines runtime for the shell's own Node, which is the version this script must check.
 */

export type CheckStatus = "manual" | "missing" | "ok" | "wrong";

export interface CheckResult {
  detail: string;
  /** Exact command or step that resolves a missing or wrong result. */
  fix?: string;
  id: string;
  label: string;
  status: CheckStatus;
}

export interface CommandOutput {
  errorCode?: string;
  ok: boolean;
  stdout: string;
}

/** Everything the checks read from the machine, injectable so tests need no real tools. */
export interface Environment {
  env: NodeJS.ProcessEnv;
  exists: (path: string) => boolean;
  home: string;
  list: (path: string) => string[];
  nodeVersion: string;
  platform: NodeJS.Platform;
  read: (path: string) => string | undefined;
  root: string;
  run: (command: string, args: string[]) => CommandOutput;
  writable: (path: string) => boolean;
}

function isInside(root: string, path: string): boolean {
  const offset = relative(resolve(root), resolve(path));
  return offset === "" || (!offset.startsWith("..") && !isAbsolute(offset));
}

export function parseVersion(text: string): [number, number, number] | undefined {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function check(
  id: string,
  label: string,
  status: CheckStatus,
  detail: string,
  fix?: string,
): CheckResult {
  return { detail, fix, id, label, status };
}

function missingTool(id: string, label: string, fix: string): CheckResult {
  return check(id, label, "missing", "not found on PATH", fix);
}

function installHint(brew: string, winget: string, platform: NodeJS.Platform): string {
  if (platform === "win32") {
    return `winget install ${winget}`;
  }
  return platform === "darwin"
    ? `brew install ${brew}`
    : `Install ${brew} with your package manager`;
}

export function checkNode(machine: Environment): CheckResult {
  const wanted = machine.read(join(machine.root, ".node-version"))?.trim();
  const fix = `Install Node ${wanted ?? "per .node-version"} and activate it for agent shells (fnm, nvm, Volta, or mise with idiomatic_version_file_enable_tools including node)`;
  const have = parseVersion(machine.nodeVersion);
  const want = wanted ? parseVersion(wanted) : undefined;
  if (!have || !want) {
    return check("node", "Node.js", "wrong", `found ${machine.nodeVersion}`, fix);
  }
  // package.json accepts 24.15 or later, so the same major with a minor of at least 15 passes.
  if (have[0] !== want[0] || have[1] < Math.min(want[1], 15)) {
    return check("node", "Node.js", "wrong", `found ${have.join(".")}, wanted ${wanted}`, fix);
  }
  return check("node", "Node.js", "ok", have.join("."));
}

export function checkPnpm(machine: Environment): CheckResult {
  const result = machine.run("pnpm", ["--version"]);
  if (!result.ok) {
    if (result.errorCode !== "ENOENT") {
      return check(
        "pnpm",
        "pnpm",
        "wrong",
        result.errorCode === "ETIMEDOUT"
          ? "pnpm --version timed out after 20 seconds"
          : result.stdout.trim().split(/\r?\n/)[0] || "pnpm --version failed",
      );
    }
    return missingTool(
      "pnpm",
      "pnpm",
      "Install pnpm; on Windows PowerShell, run pnpm.cmd if the execution policy blocks pnpm.ps1",
    );
  }
  const manifest = machine.read(join(machine.root, "package.json"));
  const pinned = /"packageManager":\s*"pnpm@([^"]+)"/.exec(manifest ?? "")?.[1];
  const have = result.stdout.trim();
  if (pinned && parseVersion(pinned)?.[0] !== parseVersion(have)?.[0]) {
    return check(
      "pnpm",
      "pnpm",
      "wrong",
      `found ${have}, package.json pins ${pinned}; the launcher major should match`,
      "Upgrade the machine's pnpm (for example `pnpm self-update`)",
    );
  }
  return check("pnpm", "pnpm", "ok", have);
}

export function checkShellcheck(machine: Environment): CheckResult {
  return machine.run("shellcheck", ["--version"]).ok
    ? check("shellcheck", "ShellCheck", "ok", "installed")
    : missingTool(
        "shellcheck",
        "ShellCheck",
        installHint("shellcheck", "koalaman.shellcheck", machine.platform),
      );
}

export function checkGit(machine: Environment): CheckResult[] {
  const version = machine.run("git", ["--version"]);
  if (!version.ok) {
    return [missingTool("git", "Git", installHint("git", "Git.Git", machine.platform))];
  }
  const results = [check("git", "Git", "ok", version.stdout.trim())];
  if (machine.platform === "win32") {
    const longpaths = machine.run("git", ["config", "--global", "--get", "core.longpaths"]);
    results.push(
      longpaths.stdout.trim() === "true"
        ? check("git-longpaths", "Git long paths", "ok", "core.longpaths is true")
        : check(
            "git-longpaths",
            "Git long paths",
            "wrong",
            "core.longpaths is not true",
            "git config --global core.longpaths true",
          ),
    );
  }
  const remote = machine.run("git", ["-C", machine.root, "remote", "get-url", "origin"]);
  if (remote.ok) {
    // Only the scheme is inspected; the URL is never printed because it can embed a token.
    results.push(
      remote.stdout.trim().startsWith("https://")
        ? check("git-remote", "HTTPS remote", "ok", "origin uses HTTPS")
        : check(
            "git-remote",
            "HTTPS remote",
            "wrong",
            "origin does not use HTTPS (docs/agent-workflow.md, git identity)",
            "git remote set-url origin https://github.com/mrh-is/mistria-fyi.git",
          ),
    );
  }
  const signing = machine.run("git", ["config", "--get", "commit.gpgsign"]);
  const key = machine.run("git", ["config", "--get", "user.signingkey"]);
  results.push(
    signing.stdout.trim() === "true" && key.ok
      ? check("git-signing", "Commit signing", "ok", "commit.gpgsign is on and a key is configured")
      : check(
          "git-signing",
          "Commit signing",
          "manual",
          "not configured; unsigned commits are acceptable only in cloud sandboxes",
          "Configure a local SSH signing key per docs/agent-workflow.md, git identity (gpg.format = ssh, gpg.ssh.program = ssh-keygen)",
        ),
  );
  return results;
}

export function checkGh(machine: Environment): CheckResult[] {
  if (!machine.run("gh", ["--version"]).ok) {
    return [missingTool("gh", "GitHub CLI", installHint("gh", "GitHub.cli", machine.platform))];
  }
  // Only the exit code is read; `gh auth status` output is discarded.
  const auth = machine.run("gh", ["auth", "status"]);
  return [
    check("gh", "GitHub CLI", "ok", "installed"),
    auth.ok
      ? check("gh-auth", "GitHub login", "ok", "authenticated")
      : check(
          "gh-auth",
          "GitHub login",
          "missing",
          "not logged in",
          "Run `gh auth login` (HTTPS) yourself; this script never handles credentials",
        ),
  ];
}

export function checkPython(machine: Environment): CheckResult {
  const candidates: [string, string[]][] = [
    ["python3", ["--version"]],
    ["python", ["--version"]],
    ["py", ["-3", "--version"]],
  ];
  for (const [command, args] of candidates) {
    const result = machine.run(command, args);
    // The Microsoft Store alias exits nonzero or prints an install hint instead of a version.
    if (result.ok && /Python 3\.\d+/.test(result.stdout)) {
      return check("python", "Python 3", "ok", result.stdout.trim());
    }
  }
  return check(
    "python",
    "Python 3 (public-repo procedure only)",
    "missing",
    "no real Python 3 found (the Windows Store alias does not count)",
    installHint("python", "Python.Python.3.13", machine.platform),
  );
}

export function checkDependencies(machine: Environment): CheckResult {
  return machine.exists(join(machine.root, "node_modules"))
    ? check("dependencies", "Installed dependencies", "ok", "node_modules present")
    : check(
        "dependencies",
        "Installed dependencies",
        "missing",
        "node_modules is absent",
        "pnpm install --frozen-lockfile",
      );
}

export function playwrightCacheDirectory(machine: Environment): string {
  const override = machine.env.PLAYWRIGHT_BROWSERS_PATH;
  if (override && override !== "0") {
    return override;
  }
  if (machine.platform === "win32") {
    return join(
      machine.env.LOCALAPPDATA ?? join(machine.home, "AppData", "Local"),
      "ms-playwright",
    );
  }
  return machine.platform === "darwin"
    ? join(machine.home, "Library", "Caches", "ms-playwright")
    : join(machine.home, ".cache", "ms-playwright");
}

export function checkPlaywright(machine: Environment): CheckResult {
  const directory = playwrightCacheDirectory(machine);
  // Browser folders carry a build suffix, such as chromium-1234.
  const installed = machine.list(directory);
  const absent = ["firefox", "chromium"].filter(
    (browser) => !installed.some((entry) => entry.startsWith(`${browser}-`)),
  );
  return absent.length === 0
    ? check("playwright", "Playwright browsers", "ok", `firefox & chromium in ${directory}`)
    : check(
        "playwright",
        "Playwright browsers (accessibility suites only)",
        "missing",
        `${absent.join(" & ")} not found in ${directory}`,
        "pnpm exec playwright install firefox chromium",
      );
}

export function checkGameAssets(machine: Environment): CheckResult {
  const input = join(machine.root, "pipeline", "input");
  const versions = machine
    .list(input)
    .filter(
      (entry) =>
        /^v\d+\.\d+\.\d+$/.test(entry) && machine.exists(join(input, entry, "assets", "fiddle")),
    )
    .toSorted();
  return versions.length > 0
    ? check(
        "game-assets",
        "Game assets",
        "ok",
        `pipeline/input contains assets for ${versions.join(", ")}`,
      )
    : check(
        "game-assets",
        "Game assets (pipeline work only)",
        "missing",
        "no pipeline/input/vX.Y.Z/assets/fiddle directory found",
        "Point pipeline/input at the synced Mistria folder containing vX.Y.Z/assets; see docs/game-version-update-protocol.md",
      );
}

export function checkPnpmStore(machine: Environment): CheckResult | undefined {
  if (!machine.env.CODEX_THREAD_ID && !machine.env.CODEX_SANDBOX) {
    return undefined;
  }
  const label = "pnpm store outside the repo";
  const fix =
    "Set shell_environment_policy.set.pnpm_config_store_dir and sandbox_workspace_write.writable_roots in user-level ~/.codex/config.toml; see docs/machine-setup.md, Codex shells";
  const configured = machine.env.pnpm_config_store_dir;
  if (!configured) {
    // pnpm 11 reads only pnpm_config_* variables, so the npm_config_* spelling is silently ignored.
    const detail = machine.env.npm_config_store_dir
      ? "only the legacy npm_config_store_dir is set, which pnpm 11 ignores"
      : "pnpm_config_store_dir is unset; pnpm may create a repo-local .pnpm-store";
    return check("pnpm-store", label, "wrong", detail, fix);
  }
  if (!isAbsolute(configured) || isInside(machine.root, configured)) {
    return check("pnpm-store", label, "wrong", `${configured} is not outside the repo`, fix);
  }
  const database = join(configured, "v11", "index.db");
  const unwritable = [configured, ...(machine.exists(database) ? [database] : [])].find(
    (path) => !machine.writable(path),
  );
  if (unwritable) {
    return check(
      "pnpm-store",
      label,
      "wrong",
      `${unwritable} is not writable from this shell`,
      fix,
    );
  }
  const effective = machine.run("pnpm", ["--dir", machine.root, "config", "get", "store-dir"]);
  if (!effective.ok) {
    const reason = effective.stdout.trim().split("\n")[0];
    return check(
      "pnpm-store",
      label,
      "wrong",
      `pnpm could not report its store${reason ? `: ${reason}` : ""}`,
      fix,
    );
  }
  const resolved = effective.stdout.trim();
  return resolve(resolved) === resolve(configured)
    ? check("pnpm-store", label, "ok", resolved)
    : check("pnpm-store", label, "wrong", `pnpm uses ${resolved}, not ${configured}`, fix);
}

/** Logins no script can perform for the user. */
export function manualSteps(): CheckResult[] {
  return [
    check(
      "wrangler",
      "Wrangler login (R2 uploads only)",
      "manual",
      "not probed; the login is interactive",
      "pnpm exec wrangler login, then pnpm exec wrangler whoami",
    ),
  ];
}

export function runChecks(machine: Environment): CheckResult[] {
  const store = checkPnpmStore(machine);
  return [
    checkNode(machine),
    checkPnpm(machine),
    checkDependencies(machine),
    ...checkGit(machine),
    ...checkGh(machine),
    checkShellcheck(machine),
    checkPlaywright(machine),
    checkGameAssets(machine),
    checkPython(machine),
    ...(store ? [store] : []),
    ...manualSteps(),
  ];
}

/** Exit status: nonzero while any check is missing or wrong; manual steps never fail the run. */
export function exitCode(results: CheckResult[]): number {
  return results.some((result) => result.status === "missing" || result.status === "wrong") ? 1 : 0;
}

export function formatReport(results: CheckResult[]): string {
  const marks: Record<CheckStatus, string> = {
    manual: "[todo]   ",
    missing: "[missing]",
    ok: "[ok]     ",
    wrong: "[wrong]  ",
  };
  const lines = results.flatMap((result) => [
    `${marks[result.status]} ${result.label}: ${result.detail}`,
    ...(result.status !== "ok" && result.fix ? [`          fix: ${result.fix}`] : []),
  ]);
  const problems = results.filter((r) => r.status === "missing" || r.status === "wrong").length;
  lines.push(
    "",
    problems === 0
      ? "All checked prerequisites pass. Steps marked [todo] are interactive; see docs/machine-setup.md."
      : `${problems} prerequisite(s) need attention. This script changes nothing; follow docs/machine-setup.md.`,
  );
  return lines.join("\n");
}

export type ProcessRunner = (
  command: string,
  args: string[] | undefined,
  options: SpawnSyncOptionsWithStringEncoding,
) => SpawnSyncReturns<string>;

export function realEnvironment(
  root: string,
  platform: NodeJS.Platform = process.platform,
  runProcess: ProcessRunner = (command, args, options) =>
    args ? spawnSync(command, args, options) : spawnSync(command, options),
): Environment {
  return {
    env: process.env,
    exists: existsSync,
    home: homedir(),
    list: (path) => {
      try {
        return readdirSync(path);
      } catch {
        return [];
      }
    },
    nodeVersion: process.versions.node,
    platform,
    read: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return undefined;
      }
    },
    root,
    run: (command, args) => {
      const options: SpawnSyncOptionsWithStringEncoding = {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 20_000,
      };
      const windowsPnpm = platform === "win32" && command === "pnpm";
      if (windowsPnpm) {
        // cmd.exe starts successfully even when pnpm is absent. Check PATH before invoking the
        // shim so a shell-level failure cannot disguise a missing pnpm installation.
        const located = runProcess("where.exe", ["pnpm"], options);
        if (located.status === 1) {
          return { errorCode: "ENOENT", ok: false, stdout: "" };
        }
      }
      // Node spawns Windows .cmd shims such as pnpm.cmd only through a shell. Every other probe is
      // a real executable, so it runs without one and keeps paths with spaces (machine.root)
      // intact. The shell gets one string, since Node deprecates (DEP0190) shell with an args
      // array; pnpm's arguments are fixed literals, so joining them is safe.
      const result = windowsPnpm
        ? runProcess([command, ...args].join(" "), undefined, { ...options, shell: true })
        : runProcess(command, args, options);
      return {
        errorCode:
          result.error && "code" in result.error && typeof result.error.code === "string"
            ? result.error.code
            : undefined,
        ok: result.status === 0,
        stdout: `${result.stdout ?? ""}${result.stderr ?? ""}`,
      };
    },
    writable: (path) => {
      try {
        accessSync(path, constants.W_OK);
        return true;
      } catch {
        return false;
      }
    },
  };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const results = runChecks(realEnvironment(root));
  console.log(formatReport(results));
  process.exitCode = exitCode(results);
}
