import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { planInstall, planLinks } from "./setup-worktree.js";

const script = fileURLToPath(new URL("setup-worktree.ts", import.meta.url));
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "mistria-setup-"));
  directories.push(directory);
  return directory;
}

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

/**
 * Points the script's pnpm launcher at a fake. Windows environment keys are case-insensitive and
 * pnpm may export `NPM_EXECPATH`, so drop every spelling before setting it.
 */
function withFakePnpm(pnpm: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "npm_execpath"),
  );
  return { ...env, npm_execpath: pnpm };
}

describe("planInstall", () => {
  const codex = { CODEX_THREAD_ID: "fixture" };
  const store = "/Users/test/Library/pnpm/store";

  it("pins install & prepare to an external store for local Codex on macOS", () => {
    expect(planInstall("darwin", { ...codex, pnpm_config_store_dir: store })).toEqual({
      env: {
        pnpm_config_confirm_modules_purge: "false",
        pnpm_config_store_dir: store,
      },
      installArgs: [
        "install",
        "--frozen-lockfile",
        "--store-dir",
        store,
        "--config.confirmModulesPurge=false",
      ],
    });
  });

  it("preserves an explicit store override", () => {
    const plan = planInstall("darwin", {
      ...codex,
      npm_config_store_dir: "/private/tmp/legacy-pnpm-store",
      pnpm_config_store_dir: "/private/tmp/custom-pnpm-store",
    });
    expect(plan.env.pnpm_config_store_dir).toBe("/private/tmp/custom-pnpm-store");
    expect(plan.env).not.toHaveProperty("npm_config_store_dir");
  });

  it.each([undefined, ""])("refuses an unset or empty store (%s)", (value) => {
    expect(() =>
      planInstall("darwin", {
        ...codex,
        npm_config_store_dir: store,
        pnpm_config_store_dir: value,
      }),
    ).toThrow("docs/machine-setup.md");
  });

  it.each(["linux", "win32"] as const)("leaves %s pnpm settings alone", (platform) => {
    expect(planInstall(platform, codex)).toEqual({
      env: {},
      installArgs: ["install", "--frozen-lockfile"],
    });
  });
});

describe("planLinks", () => {
  it("links existing entries & skips missing, tracked, or already-present ones", () => {
    const root = temporaryDirectory();
    const main = join(root, "main");
    const worktree = join(root, "worktree");
    mkdirSync(join(main, "pipeline/input"), { recursive: true });
    mkdirSync(join(main, "tests/browser/fixtures/local"), { recursive: true });
    mkdirSync(join(worktree, "tests/browser/fixtures/local"), { recursive: true });
    writeFileSync(join(main, ".env.example"), "");
    writeFileSync(join(main, ".env.local"), "");
    writeFileSync(join(worktree, ".env.example"), "");

    const plans = planLinks(main, worktree, [
      "pipeline/input/",
      "tests/browser/fixtures/local/",
      ".env",
      ".env.*",
      ".dev.vars",
      "",
    ]);

    expect(plans).toEqual([
      {
        destination: join(worktree, "pipeline/input"),
        directory: true,
        source: join(main, "pipeline/input"),
      },
      {
        destination: join(worktree, ".env.local"),
        directory: false,
        source: join(main, ".env.local"),
      },
    ]);
  });
});

/** A main checkout with shared game assets, a CRLF `.worktreeinclude`, a linked worktree, & a fake pnpm. */
function fixture() {
  const root = temporaryDirectory();
  const main = join(root, "main");
  const worktree = join(root, "worktree");
  mkdirSync(main);
  git(main, "init");
  writeFileSync(join(main, ".gitignore"), "pipeline/input/\n.env\n");
  writeFileSync(join(main, ".worktreeinclude"), ".env\r\n.dev.vars\r\n");
  git(main, "add", ".");
  execFileSync(
    "git",
    [
      "-C",
      main,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "Fixture",
    ],
    { stdio: "pipe" },
  );
  mkdirSync(join(main, "pipeline/input/assets"), { recursive: true });
  writeFileSync(join(main, "pipeline/input/assets/misc.toml"), "version = 1\n");
  writeFileSync(join(main, ".env"), "SECRET=1\n");
  git(main, "worktree", "add", "--detach", worktree);

  const log = join(root, "pnpm-calls");
  const pnpm = join(root, "fake-pnpm.mjs");
  writeFileSync(
    pnpm,
    `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(" ") + "\\n");
const fails = process.env.FAKE_PNPM_FAIL;
process.exitCode = fails && process.argv.slice(2).join(" ").startsWith(fails) ? 1 : 0;
`,
  );
  const run = (env: NodeJS.ProcessEnv = {}, args: string[] = [], cwd = worktree, input = "") =>
    spawnSync(process.execPath, [script, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...withFakePnpm(pnpm), CODEX_THREAD_ID: "", ...env },
      input,
    });
  return { log, main, run, worktree };
}

describe("setup-worktree", () => {
  it.skipIf(process.platform !== "darwin")(
    "reports an unset Codex store without a stack trace or side effects",
    () => {
      const { log, run, worktree } = fixture();
      const result = run({ CODEX_THREAD_ID: "fixture", pnpm_config_store_dir: "" });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/^error: pnpm_config_store_dir is unset\./);
      expect(result.stderr.trim().split("\n")).toHaveLength(1);
      expect(result.stderr).toContain("docs/machine-setup.md");
      expect(existsSync(log)).toBe(false);
      expect(existsSync(join(worktree, "pipeline/input"))).toBe(false);
    },
  );

  it("links shared inputs readably, then installs & prepares", () => {
    const { log, main, run, worktree } = fixture();
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(worktree, "pipeline/input/assets/misc.toml"), "utf8")).toBe(
      "version = 1\n",
    );
    expect(readFileSync(join(worktree, ".env"), "utf8")).toBe("SECRET=1\n");
    expect(existsSync(join(worktree, ".dev.vars"))).toBe(false);
    expect(readFileSync(log, "utf8")).toBe("install --frozen-lockfile\nrun prepare\n");
    expect(git(main, "worktree", "list", "--porcelain")).not.toContain("prunable");
  });

  it("skips already-linked entries on a rerun", () => {
    const { run } = fixture();
    expect(run().status).toBe(0);
    const rerun = run();
    expect(rerun.status, rerun.stderr).toBe(0);
  });

  it("leaves the main checkout's inputs intact when the worktree is force-removed", () => {
    const { main, run, worktree } = fixture();
    expect(run().status).toBe(0);
    git(main, "worktree", "remove", "--force", worktree);
    // Git for Windows unregisters the worktree but leaves junctions behind; Node removes the
    // junction itself rather than following it.
    rmSync(worktree, { force: true, recursive: true });
    expect(existsSync(worktree)).toBe(false);
    expect(readFileSync(join(main, "pipeline/input/assets/misc.toml"), "utf8")).toBe(
      "version = 1\n",
    );
    expect(readFileSync(join(main, ".env"), "utf8")).toBe("SECRET=1\n");
  });

  it("initializes an absent worktree at session start, then leaves it alone", () => {
    const { log, run, worktree } = fixture();
    const first = run({}, ["--session-start"]);
    expect(first.status, first.stderr).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({
      hookSpecificOutput: {
        additionalContext: expect.stringContaining(
          "linked 2 entries from the main checkout; installed dependencies",
        ) as string,
        hookEventName: "SessionStart",
      },
    });
    expect(readFileSync(join(worktree, ".env"), "utf8")).toBe("SECRET=1\n");
    expect(readFileSync(log, "utf8")).toBe("install --frozen-lockfile\nrun prepare\n");

    mkdirSync(join(worktree, "node_modules"));
    const again = run({}, ["--session-start"]);
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toBe("");
    expect(readFileSync(log, "utf8")).toBe(
      "install --frozen-lockfile\nrun prepare\nexec node --version\n",
    );
  });

  it("sets up the hook input's directory when the hook runs from the main checkout", () => {
    const { log, main, run, worktree } = fixture();
    const result = run(
      {},
      ["--session-start"],
      main,
      JSON.stringify({ cwd: worktree, hook_event_name: "SessionStart" }),
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      `Initialized ${JSON.stringify(realpathSync(worktree)).slice(1, -1)} with`,
    );
    expect(result.stdout).toContain("linked 2 entries");
    expect(readFileSync(join(worktree, "pipeline/input/assets/misc.toml"), "utf8")).toBe(
      "version = 1\n",
    );
    expect(existsSync(join(main, "node_modules"))).toBe(false);
    expect(readFileSync(log, "utf8")).toBe("install --frozen-lockfile\nrun prepare\n");
  });

  it("reinstalls stale dependencies at session start", () => {
    const { log, run, worktree } = fixture();
    mkdirSync(join(worktree, "node_modules"));
    expect(run().status).toBe(0);
    rmSync(log);
    const result = run({ FAKE_PNPM_FAIL: "exec" }, ["--session-start"]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      hookSpecificOutput: {
        additionalContext: expect.stringMatching(/: installed dependencies/) as string,
      },
    });
    expect(readFileSync(log, "utf8")).toBe(
      "exec node --version\ninstall --frozen-lockfile\nrun prepare\n",
    );
  });

  it("links absent entries at session start without reinstalling present dependencies", () => {
    const { log, run, worktree } = fixture();
    mkdirSync(join(worktree, "node_modules"));
    const result = run({}, ["--session-start"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("linked 2 entries from the main checkout.");
    expect(existsSync(join(worktree, "pipeline/input/assets/misc.toml"))).toBe(true);
    expect(readFileSync(log, "utf8")).toBe("exec node --version\n");
  });

  it("reports a failed session-start setup as context without blocking the session", () => {
    const { log, run } = fixture();
    const result = run({ FAKE_PNPM_FAIL: "install" }, ["--session-start"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      hookSpecificOutput: {
        additionalContext: expect.stringContaining("failed with exit status 1") as string,
      },
    });
    expect(readFileSync(log, "utf8")).toBe("install --frozen-lockfile\n");
  });

  it("installs only the main checkout's absent dependencies at session start", () => {
    const { log, main, run } = fixture();
    const session = () => run({}, ["--session-start"], main);
    const first = session();
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).not.toContain("linked");
    expect(readFileSync(log, "utf8")).toBe("install --frozen-lockfile\nrun prepare\n");
    mkdirSync(join(main, "node_modules"));
    const again = session();
    expect(again.stdout).toBe("");
    expect(readFileSync(log, "utf8")).toBe(
      "install --frozen-lockfile\nrun prepare\nexec node --version\n",
    );
  });

  it("refuses to run in the main checkout", () => {
    const { main } = fixture();
    const result = spawnSync(process.execPath, [script], { cwd: main, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("is the main checkout");
  });
});
