import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Machine doctor: reports whether this machine meets the prerequisites in docs/machine-setup.md.
 * It is read-only. It never installs, configures, or authenticates, and it never reads credentials;
 * the login probes inspect an exit code only. Plain Node with no dependencies, so it runs before
 * `pnpm install` (and before pnpm exists): `node scripts/machine-doctor.ts`.
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
  const fix = `Install Node ${wanted ?? "per .node-version"} and activate it for agent shells (fnm, nvm, or Volta)`;
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
            "origin does not use HTTPS (AGENTS.md §2)",
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
          "Configure a local SSH signing key per AGENTS.md §2 (gpg.format = ssh, gpg.ssh.program = ssh-keygen)",
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
  return machine.exists(join(machine.root, "pipeline", "input", "assets"))
    ? check("game-assets", "Game assets", "ok", "pipeline/input/assets present")
    : check(
        "game-assets",
        "Game assets (pipeline work only)",
        "missing",
        "pipeline/input/assets is absent",
        "Point it at a synced Mistria/vX.Y.Z/assets folder; see docs/game-version-update-protocol.md",
      );
}

export function checkPnpmStore(machine: Environment): CheckResult | undefined {
  if (!machine.env.CODEX_THREAD_ID && !machine.env.CODEX_SANDBOX) {
    return undefined;
  }
  return machine.env.npm_config_store_dir
    ? check("pnpm-store", "pnpm store outside the repo", "ok", "npm_config_store_dir is set")
    : check(
        "pnpm-store",
        "pnpm store outside the repo",
        "wrong",
        "Codex shell without npm_config_store_dir; pnpm may create a repo-local .pnpm-store",
        "Set npm_config_store_dir=/private/tmp/codex-pnpm-store (see AGENTS.md, Package manager stores)",
      );
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

export function realEnvironment(root: string): Environment {
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
    platform: process.platform,
    read: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return undefined;
      }
    },
    root,
    run: (command, args) => {
      // Windows shims (pnpm.cmd, gh.cmd) need a shell; every argument here is a fixed literal.
      const result = spawnSync(command, args, {
        encoding: "utf8",
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 20_000,
      });
      return { ok: result.status === 0, stdout: `${result.stdout ?? ""}${result.stderr ?? ""}` };
    },
  };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const results = runChecks(realEnvironment(root));
  console.log(formatReport(results));
  process.exitCode = exitCode(results);
}
