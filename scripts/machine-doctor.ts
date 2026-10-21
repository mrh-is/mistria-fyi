import { CURRENT_GAME_VERSION } from "#game-version";
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

function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function readEnginesNode(manifest: string | undefined): string | undefined {
  try {
    return (JSON.parse(manifest ?? "{}") as { engines?: { node?: string } }).engines?.node;
  } catch {
    return undefined;
  }
}

/** Homebrew's versioned formulae are keg-only, so each install also links the binary. */
function brewVersioned(formula: string): string {
  return `brew install ${formula} && brew link --force ${formula}`;
}

/**
 * The shell's Node only has to satisfy package.json's `engines`: `devEngines.runtime` makes every
 * `pnpm run` & `pnpm exec` use `.node-version`'s release, and this script & Claude's hooks, which
 * run on bare `node`, skip the pinned-Node guard. Contributors need no version manager.
 */
export function checkNode(machine: Environment): CheckResult {
  const pinned = machine.read(join(machine.root, ".node-version"))?.trim();
  const manifest = machine.read(join(machine.root, "package.json"));
  const range = readEnginesNode(manifest);
  const bounds = /^>=\s*(\d+\.\d+\.\d+)\s+<\s*(\d+\.\d+\.\d+)$/.exec(range?.trim() ?? "");
  const min = bounds ? parseVersion(bounds[1]) : undefined;
  const max = bounds ? parseVersion(bounds[2]) : undefined;
  if (!min || !max) {
    return check(
      "node",
      "Node.js",
      "wrong",
      `package.json engines.node is ${range ? `"${range}"` : "missing"}, not ">=X.Y.Z <X.Y.Z"`,
      "Declare engines.node in package.json as a >= & < pair",
    );
  }
  // The unversioned Homebrew & winget packages track Node's newest major, which can leave engines.
  const major = pinned ? parseVersion(pinned)?.[0] : undefined;
  const installers: Partial<Record<NodeJS.Platform, string>> = {
    darwin: `${brewVersioned(`node@${major ?? "<major>"}`)} (brew unlink node first if Homebrew's newer node is linked)`,
    win32: "winget install OpenJS.NodeJS.LTS",
  };
  const fix = `Install a Node release within package.json engines (${range}): ${installers[machine.platform] ?? "use your package manager"}; pnpm supplies ${pinned ?? "the pinned release"} for scripts, so no version manager is needed`;
  const have = parseVersion(machine.nodeVersion);
  if (!have || compareVersions(have, min) < 0 || compareVersions(have, max) >= 0) {
    return check("node", "Node.js", "wrong", `found ${machine.nodeVersion}, outside ${range}`, fix);
  }
  return check(
    "node",
    "Node.js",
    "ok",
    `${have.join(".")}; pnpm runs scripts on ${pinned ?? "the pinned release"}`,
  );
}

export function checkPnpm(machine: Environment): CheckResult {
  const manifest = machine.read(join(machine.root, "package.json"));
  const pinned = /"packageManager":\s*"pnpm@([^"]+)"/.exec(manifest ?? "")?.[1];
  const major = pinned ? parseVersion(pinned)?.[0] : undefined;
  // Homebrew's unversioned pnpm formula tracks pnpm's newest major, so name the pinned one.
  const version = major === undefined ? "pnpm" : `pnpm ${major}`;
  const brew = brewVersioned(`pnpm@${major ?? "<major>"}`);
  const install =
    machine.platform === "darwin"
      ? brew
      : `Install ${version}; docs/machine-setup.md lists installers`;
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
      machine.platform === "win32"
        ? `${install}; on Windows PowerShell, run pnpm.cmd if the execution policy blocks pnpm.ps1`
        : install,
    );
  }
  const have = result.stdout.trim();
  if (major !== undefined && major !== parseVersion(have)?.[0]) {
    return check(
      "pnpm",
      "pnpm",
      "wrong",
      `found ${have}, package.json pins ${pinned}; the launcher major should match`,
      machine.platform === "darwin"
        ? `pnpm self-update ${major}; for Homebrew's pnpm, brew uninstall pnpm && ${brew}`
        : `pnpm self-update ${major}`,
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
  // tag.gpgsign turns every `git tag` into a signed annotated tag, which needs a message & a key.
  const tagSigning = machine.run("git", ["config", "--get", "tag.gpgsign"]);
  if (tagSigning.stdout.trim() === "true") {
    results.push(
      key.ok
        ? check(
            "git-tag-signing",
            "Tag signing",
            "ok",
            "tag.gpgsign is on; scripts & tests that run `git tag` need -m or -c tag.gpgsign=false",
          )
        : check(
            "git-tag-signing",
            "Tag signing",
            "wrong",
            "tag.gpgsign is on without user.signingkey, so every `git tag` fails",
            "git config --global --unset tag.gpgsign, or configure a signing key",
          ),
    );
  }
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

// Headless runs launch the separate headless shell, not the full chromium build.
const PLAYWRIGHT_BROWSERS = ["chromium", "chromium-headless-shell", "firefox"];

/**
 * The browser revisions the installed playwright-core expects, from its browsers.json, or undefined
 * before `pnpm install` or when the store holds more than one playwright-core.
 */
export function playwrightRevisions(machine: Environment): Map<string, string> | undefined {
  const store = join(machine.root, "node_modules", ".pnpm");
  const cores = machine.list(store).filter((entry) => /^playwright-core@[^_]+$/.test(entry));
  if (cores.length !== 1) {
    return undefined;
  }
  const text = machine.read(
    join(store, cores[0], "node_modules", "playwright-core", "browsers.json"),
  );
  try {
    const { browsers } = JSON.parse(text ?? "") as {
      browsers: { name: string; revision: string }[];
    };
    return new Map(browsers.map(({ name, revision }) => [name, revision]));
  } catch {
    return undefined;
  }
}

export function checkPlaywright(machine: Environment): CheckResult {
  const directory = playwrightCacheDirectory(machine);
  const revisions = playwrightRevisions(machine);
  // Cache folders join an underscored name & revision, such as chromium_headless_shell-1243.
  const folders = PLAYWRIGHT_BROWSERS.map(
    (browser) => `${browser.replaceAll("-", "_")}-${revisions?.get(browser) ?? "*"}`,
  );
  const installed = machine.list(directory);
  const absent = folders.filter((folder) =>
    folder.endsWith("-*")
      ? !installed.some((entry) => entry.startsWith(folder.slice(0, -1)))
      : !installed.includes(folder),
  );
  const unchecked = revisions === undefined ? "; revisions unchecked until pnpm install" : "";
  return absent.length === 0
    ? check(
        "playwright",
        "Playwright browsers",
        "ok",
        `${folders.join(", ")} in ${directory}${unchecked}`,
      )
    : check(
        "playwright",
        "Playwright browsers (accessibility & PWA suites only)",
        "missing",
        `${absent.join(", ")} not found in ${directory}`,
        "pnpm exec playwright install chromium firefox",
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
    .toSorted((left, right) => left.localeCompare(right, "en", { numeric: true }));
  const wanted = `v${CURRENT_GAME_VERSION}`;
  const location = `pipeline/input/${wanted}/assets/fiddle`;
  const available = versions.length > 0 ? versions.join(", ") : "none";
  return versions.includes(wanted)
    ? check(
        "game-assets",
        "Game assets",
        "ok",
        `${location} present; available releases: ${available}`,
      )
    : check(
        "game-assets",
        "Game assets (pipeline work only)",
        "missing",
        `${location} is absent; available releases: ${available}`,
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
