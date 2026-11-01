import { execFileSync, spawn, spawnSync } from "node:child_process";
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

import {
  modeOf,
  planInstall,
  planLinks,
  resolveEvent,
  sameRepository,
  withSetupLock,
} from "./setup-worktree.js";

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
  it("links existing entries & skips missing, tracked, excluded, or already-present ones", () => {
    const root = temporaryDirectory();
    const main = join(root, "main");
    const worktree = join(root, "worktree");
    mkdirSync(join(main, "pipeline/input"), { recursive: true });
    mkdirSync(join(main, "tests/browser/fixtures/local"), { recursive: true });
    mkdirSync(join(worktree, "tests/browser/fixtures/local"), { recursive: true });
    writeFileSync(join(main, ".env.example"), "");
    writeFileSync(join(main, ".env.local"), "");
    writeFileSync(join(main, ".env.r2-upload"), "");
    writeFileSync(join(worktree, ".env.example"), "");

    const plans = planLinks(main, worktree, [
      "pipeline/input/",
      "tests/browser/fixtures/local/",
      ".env",
      ".env.*",
      "!.env.r2-upload",
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
    `import { appendFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
appendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(" ") + "\\n");
const fails = process.env.FAKE_PNPM_FAIL;
process.exitCode = fails && process.argv.slice(2).join(" ").startsWith(fails) ? 1 : 0;
const stale = process.env.FAKE_PNPM_STALE;
if (stale && process.argv[2] === "exec" && existsSync(stale)) process.exitCode = 1;
if (stale && process.argv[2] === "install" && !process.exitCode) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  mkdirSync("node_modules", { recursive: true });
  rmSync(stale, { force: true });
}
`,
  );
  const run = (env: NodeJS.ProcessEnv = {}, args: string[] = [], cwd = worktree, input = "") =>
    spawnSync(process.execPath, [script, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...withFakePnpm(pnpm), CODEX_THREAD_ID: "", ...env },
      input,
    });
  const toolOptions = (env: NodeJS.ProcessEnv = {}) => ({
    cwd: main,
    encoding: "utf8" as const,
    env: { ...withFakePnpm(pnpm), CODEX_THREAD_ID: "", ...env },
  });
  const toolArgs = [
    "--input-type=module",
    "-e",
    `
import { setupBeforeTool } from ${JSON.stringify(script)};
try { console.log(JSON.stringify(setupBeforeTool(process.argv[1]))); }
catch (error) { console.error(String(error)); process.exitCode = 2; }
`,
    worktree,
  ];
  const toolSetup = (env: NodeJS.ProcessEnv = {}, directory = worktree) =>
    spawnSync(process.execPath, [...toolArgs.slice(0, -1), directory], toolOptions(env));
  const concurrentSetup = (env: NodeJS.ProcessEnv) =>
    new Promise<null | number>((resolve, reject) => {
      const child = spawn(process.execPath, toolArgs, { ...toolOptions(env), stdio: "ignore" });
      child.once("error", reject);
      child.once("exit", resolve);
    });
  return { concurrentSetup, log, main, run, toolSetup, worktree };
}

const changed = (file_path: string, event = "change") =>
  JSON.stringify({ event, file_path, hook_event_name: "FileChanged" });

const moved = (old_cwd: string, new_cwd: string) =>
  JSON.stringify({ hook_event_name: "CwdChanged", new_cwd, old_cwd });

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

  describe("FileChanged", () => {
    const settle = { MISTRIA_SETUP_SETTLE_MS: "0" };

    it("reinstalls stale dependencies after a lockfile change, run from the main checkout", () => {
      const { log, main, run, worktree } = fixture();
      mkdirSync(join(worktree, "node_modules"));
      writeFileSync(join(worktree, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
      expect(run({}, ["--session-start"], worktree).status).toBe(0);
      rmSync(log);
      const result = run(
        { ...settle, FAKE_PNPM_FAIL: "exec" },
        ["--file-changed"],
        main,
        changed(join(worktree, "pnpm-lock.yaml")),
      );
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        systemMessage: expect.stringContaining("installed dependencies") as string,
      });
      expect(readFileSync(log, "utf8")).toBe(
        "exec node --version\ninstall --frozen-lockfile\nrun prepare\n",
      );
    });

    it("stays silent & installs nothing when dependencies are current", () => {
      const { log, main, run, worktree } = fixture();
      mkdirSync(join(worktree, "node_modules"));
      expect(run({}, ["--session-start"]).status).toBe(0);
      rmSync(log);
      writeFileSync(join(worktree, "package.json"), "{}\n");
      const result = run(settle, ["--file-changed"], main, changed(join(worktree, "package.json")));
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe("");
      expect(readFileSync(log, "utf8")).toBe("exec node --version\n");
    });

    it("ignores deletions, unwatched names, nested manifests, & other repositories", () => {
      const { log, main, run, worktree } = fixture();
      mkdirSync(join(worktree, "nested"));
      writeFileSync(join(worktree, "nested/package.json"), "{}\n");
      writeFileSync(join(worktree, "package.json"), "{}\n");
      const foreign = temporaryDirectory();
      git(foreign, "init");
      writeFileSync(join(foreign, "package.json"), "{}\n");
      for (const input of [
        changed(join(worktree, "package.json"), "unlink"),
        changed(join(worktree, "README.md")),
        changed(join(worktree, "nested/package.json")),
        changed(join(foreign, "package.json")),
        "",
      ]) {
        const result = run(settle, ["--file-changed"], main, input);
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toBe("");
      }
      expect(existsSync(log)).toBe(false);
    });

    it("reports a failed install as a message & still exits 0", () => {
      const { main, run, worktree } = fixture();
      writeFileSync(join(worktree, "package.json"), "{}\n");
      const result = run(
        { ...settle, FAKE_PNPM_FAIL: "install" },
        ["--file-changed"],
        main,
        changed(join(worktree, "package.json")),
      );
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        systemMessage: expect.stringContaining("Automatic worktree setup failed") as string,
      });
    });
  });

  describe("CwdChanged", () => {
    it("sets up a worktree the session moves into & points the watch at its manifests", () => {
      const { log, main, run, worktree } = fixture();
      writeFileSync(join(worktree, "package.json"), "{}\n");
      writeFileSync(join(worktree, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
      const result = run({}, ["--cwd-changed"], main, moved(main, worktree));
      expect(result.status, result.stderr).toBe(0);
      const output = JSON.parse(result.stdout) as { systemMessage: string; watchPaths: string[] };
      expect(output.watchPaths).toEqual([
        join(realpathSync(worktree), "pnpm-lock.yaml"),
        join(realpathSync(worktree), "package.json"),
      ]);
      expect(output.systemMessage).toContain("linked 2 entries");
      expect(readFileSync(join(worktree, ".env"), "utf8")).toBe("SECRET=1\n");
      expect(readFileSync(log, "utf8")).toBe("install --frozen-lockfile\nrun prepare\n");
    });

    it("does no setup for a move within one checkout, but still reports the watch", () => {
      const { log, main, run, worktree } = fixture();
      mkdirSync(join(worktree, "src"));
      writeFileSync(join(worktree, "package.json"), "{}\n");
      const result = run({}, ["--cwd-changed"], main, moved(worktree, join(worktree, "src")));
      expect(result.status, result.stderr).toBe(0);
      const watchPaths = [join(realpathSync(worktree), "package.json")];
      expect(JSON.parse(result.stdout)).toEqual({
        hookSpecificOutput: { hookEventName: "CwdChanged", watchPaths },
        watchPaths,
      });
      expect(existsSync(log)).toBe(false);
    });

    it("clears the watch & does nothing outside this repository", () => {
      const { log, main, run } = fixture();
      const elsewhere = temporaryDirectory();
      const result = run({}, ["--cwd-changed"], main, moved(main, elsewhere));
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ watchPaths: [] });
      expect(existsSync(log)).toBe(false);
    });
  });

  describe("Codex tool setup", () => {
    it("repairs stale dependencies & links in the target checkout, leaving the original cwd alone", () => {
      const { log, main, toolSetup, worktree } = fixture();
      mkdirSync(join(worktree, "node_modules"));
      const stale = join(worktree, "stale");
      writeFileSync(stale, "changed lockfile");
      const result = toolSetup({ FAKE_PNPM_STALE: stale });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ installed: true, linked: 2, status: 0 });
      expect(readFileSync(log, "utf8")).toBe(
        "exec node --version\ninstall --frozen-lockfile\nrun prepare\n",
      );
      expect(existsSync(join(main, "node_modules"))).toBe(false);
      expect(readFileSync(join(worktree, ".env"), "utf8")).toBe("SECRET=1\n");
      expect(toolSetup().status).toBe(0);
      expect(readFileSync(log, "utf8")).toBe(
        "exec node --version\ninstall --frozen-lockfile\nrun prepare\nexec node --version\n",
      );
    });

    it.each(["install", "run prepare"])(
      "stops after a failed %s until a successful manual repair",
      (step) => {
        const { log, run, toolSetup } = fixture();
        const failure = toolSetup({ FAKE_PNPM_FAIL: step });
        expect(failure.status).toBe(2);
        expect(failure.stderr).toContain("failed with exit status 1");
        const calls = readFileSync(log, "utf8");
        const repeated = toolSetup();
        expect(repeated.status).toBe(2);
        expect(repeated.stderr).toContain("Previous automatic setup failed");
        expect(readFileSync(log, "utf8")).toBe(calls);
        const session = run({}, ["--session-start"]);
        expect(session.status).toBe(0);
        expect(session.stdout).toContain("Automatic worktree setup");
        expect(readFileSync(log, "utf8")).toBe(calls);
        expect(run().status).toBe(0);
        expect(toolSetup().status).toBe(0);
      },
    );

    it("forces install & prepare during an explicit main-checkout repair after prepare failed", () => {
      const { log, main, run, toolSetup } = fixture();
      const stale = join(main, "stale");
      writeFileSync(stale, "stale dependencies");
      expect(
        toolSetup({ FAKE_PNPM_FAIL: "run prepare", FAKE_PNPM_STALE: stale }, main).status,
      ).toBe(2);
      expect(existsSync(join(main, "node_modules"))).toBe(true);
      rmSync(log);
      const repair = run({}, ["--repair"], main);
      expect(repair.status, repair.stderr).toBe(0);
      expect(readFileSync(log, "utf8")).toBe("install --frozen-lockfile\nrun prepare\n");
      expect(toolSetup({}, main).status).toBe(0);
      expect(existsSync(join(main, ".git/mistria-tool-setup.failure"))).toBe(false);
    });

    it("serializes concurrent tool setups & rechecks dependencies inside the shared lock", async () => {
      const { concurrentSetup, log, worktree } = fixture();
      const stale = join(worktree, "stale");
      writeFileSync(stale, "changed lockfile");
      const env = { FAKE_PNPM_STALE: stale };
      expect(await Promise.all([concurrentSetup(env), concurrentSetup(env)])).toEqual([0, 0]);
      expect(readFileSync(log, "utf8")).toBe(
        "install --frozen-lockfile\nrun prepare\nexec node --version\n",
      );
    });
  });

  it("refuses to run in the main checkout", () => {
    const { main } = fixture();
    const result = spawnSync(process.execPath, [script], { cwd: main, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("is the main checkout");
  });
});

describe("modeOf", () => {
  it("selects the mode from the flag", () => {
    expect(modeOf(["node", "x"])).toBe("manual");
    expect(modeOf(["node", "x", "--session-start"])).toBe("session-start");
    expect(modeOf(["node", "x", "--file-changed"])).toBe("file-changed");
    expect(modeOf(["node", "x", "--cwd-changed"])).toBe("cwd-changed");
  });
});

describe("resolveEvent", () => {
  it("resolves no target without a path", () => {
    expect(resolveEvent("file-changed", {}, process.cwd())).toEqual({});
    expect(resolveEvent("cwd-changed", {}, process.cwd())).toEqual({ watchPaths: [] });
  });
});

describe("sameRepository", () => {
  it("is false for a directory outside the repository", () => {
    expect(sameRepository(process.cwd(), temporaryDirectory())).toBe(false);
    expect(sameRepository(process.cwd(), process.cwd())).toBe(true);
  });
});

describe("withSetupLock", () => {
  it("releases the lock after the work, even when it throws", () => {
    const root = temporaryDirectory();
    expect(withSetupLock(root, () => existsSync(join(root, "mistria-setup.lock")))).toBe(true);
    expect(existsSync(join(root, "mistria-setup.lock"))).toBe(false);
    expect(() =>
      withSetupLock(root, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(existsSync(join(root, "mistria-setup.lock"))).toBe(false);
  });

  it("takes over a lock whose owner is gone", () => {
    const root = temporaryDirectory();
    mkdirSync(join(root, "mistria-setup.lock"));
    writeFileSync(join(root, "mistria-setup.lock/pid"), "2147483646");
    expect(withSetupLock(root, () => "done")).toBe("done");
  });

  it("times out behind a live owner", () => {
    const root = temporaryDirectory();
    mkdirSync(join(root, "mistria-setup.lock"));
    writeFileSync(join(root, "mistria-setup.lock/pid"), String(process.pid));
    expect(() => withSetupLock(root, () => "done", 300)).toThrow("timed out");
    expect(existsSync(join(root, "mistria-setup.lock"))).toBe(true);
  });
});
