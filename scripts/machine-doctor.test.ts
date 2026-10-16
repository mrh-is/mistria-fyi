import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import {
  checkGameAssets,
  checkGh,
  checkGit,
  checkNode,
  checkPlaywright,
  checkPnpm,
  checkPnpmStore,
  checkPython,
  exitCode,
  formatReport,
  parseVersion,
  realEnvironment,
  runChecks,
} from "./machine-doctor.js";

import type { CommandOutput, Environment, ProcessRunner } from "./machine-doctor.js";

const none: CommandOutput = { errorCode: "ENOENT", ok: false, stdout: "" };
const files: Record<string, string> = {
  ".node-version": "24.21.0\n",
  "package.json": '{"packageManager": "pnpm@11.28.2"}',
};

function machine(overrides: Partial<Environment> & { commands?: Record<string, string> } = {}) {
  const { commands = {}, ...rest } = overrides;
  const environment: Environment = {
    env: {},
    exists: () => false,
    home: "/home/test",
    list: () => [],
    nodeVersion: "24.21.0",
    platform: "darwin",
    read: (path) => files[basename(path)],
    root: "/repo",
    run: (command, args) => {
      const out = commands[[command, ...args].join(" ")];
      return out === undefined ? none : { ok: true, stdout: out };
    },
    writable: () => true,
    ...rest,
  };
  return environment;
}

describe("parseVersion", () => {
  it("reads the first dotted triple", () => {
    expect(parseVersion("v24.21.0")).toEqual([24, 21, 0]);
    expect(parseVersion("nope")).toBeUndefined();
  });
});

describe("checkNode", () => {
  it("passes the pinned version & later minors of the same major", () => {
    expect(checkNode(machine()).status).toBe("ok");
    expect(checkNode(machine({ nodeVersion: "24.15.1" })).status).toBe("ok");
  });

  it("flags another major, such as the Node 26 shell from issue 17", () => {
    const result = checkNode(machine({ nodeVersion: "26.5.0" }));
    expect(result.status).toBe("wrong");
    expect(result.detail).toContain("26.5.0");
  });
});

describe("checkPnpm", () => {
  it("reports a missing pnpm with a fix", () => {
    expect(checkPnpm(machine())).toMatchObject({
      detail: "not found on PATH",
      fix: expect.stringContaining("Install pnpm") as string,
      status: "missing",
    });
  });

  it("reports pnpm's first error line without an install suggestion", () => {
    const result = checkPnpm(
      machine({
        run: () => ({ ok: false, stdout: "[ERROR] unable to open database file\nmore details" }),
      }),
    );
    expect(result).toMatchObject({
      detail: "[ERROR] unable to open database file",
      status: "wrong",
    });
    expect(result.fix).toBeUndefined();
  });

  it("reports a timeout even when pnpm has no output", () => {
    const result = checkPnpm(
      machine({
        run: () => ({ errorCode: "ETIMEDOUT", ok: false, stdout: "" }),
      }),
    );
    expect(result).toMatchObject({
      detail: expect.stringContaining("timed out") as string,
      status: "wrong",
    });
    expect(result.fix).toBeUndefined();
  });

  it("flags a launcher whose major differs from the pin", () => {
    const result = checkPnpm(machine({ commands: { "pnpm --version": "10.0.0\n" } }));
    expect(result.status).toBe("wrong");
  });

  it("passes a matching major", () => {
    expect(checkPnpm(machine({ commands: { "pnpm --version": "11.28.2\n" } })).status).toBe("ok");
  });
});

describe("Windows pnpm probe", () => {
  it("detects a missing pnpm before cmd.exe can hide the missing executable", () => {
    const spawn = vi.fn<ProcessRunner>();
    spawn.mockReturnValueOnce({
      output: [null, "", "not found"],
      pid: 1,
      signal: null,
      status: 1,
      stderr: "not found",
      stdout: "",
    });
    const result = checkPnpm(realEnvironment("/repo", "win32", spawn));
    expect(result).toMatchObject({
      detail: "not found on PATH",
      fix: expect.stringContaining("Install pnpm") as string,
      status: "missing",
    });
    expect(spawn).toHaveBeenCalledExactlyOnceWith("where.exe", ["pnpm"], expect.any(Object));
  });

  it("preserves pnpm's error when its shim exists but exits unsuccessfully", () => {
    const spawn = vi.fn<ProcessRunner>();
    spawn
      .mockReturnValueOnce({
        output: [null, String.raw`C:\pnpm.cmd`, ""],
        pid: 1,
        signal: null,
        status: 0,
        stderr: "",
        stdout: "C:\\pnpm.cmd",
      })
      .mockReturnValueOnce({
        output: [null, "", "database unavailable"],
        pid: 2,
        signal: null,
        status: 1,
        stderr: "database unavailable",
        stdout: "",
      });
    const result = checkPnpm(realEnvironment("/repo", "win32", spawn));
    expect(result).toMatchObject({ detail: "database unavailable", status: "wrong" });
    expect(result.fix).toBeUndefined();
    expect(spawn).toHaveBeenLastCalledWith(
      "pnpm --version",
      undefined,
      expect.objectContaining({ shell: true }),
    );
  });
});

describe("checkGit", () => {
  it("checks long paths only on Windows", () => {
    const commands = { "git --version": "git version 2.50.0" };
    expect(checkGit(machine({ commands })).map((r) => r.id)).not.toContain("git-longpaths");
    const windows = checkGit(machine({ commands, platform: "win32" }));
    expect(windows.find((r) => r.id === "git-longpaths")?.status).toBe("wrong");
  });

  it("never prints the remote URL & flags SSH remotes", () => {
    const commands = {
      "git --version": "git version 2.50.0",
      "git -C /repo remote get-url origin": "git@github.com:mrh-is/mistria-fyi.git",
    };
    const remote = checkGit(machine({ commands })).find((r) => r.id === "git-remote");
    expect(remote?.status).toBe("wrong");
    expect(JSON.stringify(remote)).not.toContain("git@github.com");
  });

  it("treats missing signing as a manual step, not a failure", () => {
    const results = checkGit(machine({ commands: { "git --version": "git version 2.50.0" } }));
    expect(results.find((r) => r.id === "git-signing")?.status).toBe("manual");
  });
});

describe("checkGh", () => {
  it("tells the user to log in rather than logging in", () => {
    const results = checkGh(machine({ commands: { "gh --version": "gh version 2" } }));
    const auth = results.find((r) => r.id === "gh-auth");
    expect(auth?.status).toBe("missing");
    expect(auth?.fix).toContain("gh auth login");
  });

  it("does not leak `gh auth status` output", () => {
    const results = checkGh(
      machine({ commands: { "gh --version": "gh", "gh auth status": "Token: gho_secret" } }),
    );
    expect(JSON.stringify(results)).not.toContain("gho_secret");
  });
});

describe("checkPython", () => {
  it("ignores the Windows Store alias", () => {
    const commands = { "python3 --version": "Python was not found; run without arguments" };
    expect(checkPython(machine({ commands })).status).toBe("missing");
  });

  it("accepts the py launcher", () => {
    expect(checkPython(machine({ commands: { "py -3 --version": "Python 3.13.1" } })).status).toBe(
      "ok",
    );
  });
});

describe("checkPlaywright", () => {
  it("requires both browsers in the platform cache", () => {
    const partial = machine({ list: () => ["chromium-1200"] });
    expect(checkPlaywright(partial)).toMatchObject({ status: "missing" });
    const full = machine({ list: () => ["chromium-1200", "firefox-1500"] });
    expect(checkPlaywright(full).status).toBe("ok");
  });
});

describe("checkGameAssets", () => {
  it("finds structured assets in versioned release folders", () => {
    const result = checkGameAssets(
      machine({
        exists: (path) => path === "/repo/pipeline/input/v1.0.8/assets/fiddle",
        list: (path) => (path === "/repo/pipeline/input" ? ["v1.0.8", "v1.0.7"] : []),
      }),
    );
    expect(result).toMatchObject({
      detail: "pipeline/input contains assets for v1.0.8",
      status: "ok",
    });
  });

  it("does not count save-only releases, archives, or unversioned dumps", () => {
    const result = checkGameAssets(
      machine({
        exists: (path) => !path.includes("v1.0.8"),
        list: () => ["v1.0.8", "archive", "assets", "vlatest"],
      }),
    );
    expect(result.status).toBe("missing");
    expect(result.fix).toContain("vX.Y.Z/assets");
  });

  it("reports absent inputs without failing to read the directory", () => {
    expect(checkGameAssets(machine()).status).toBe("missing");
  });
});

describe("checkPnpmStore", () => {
  const store = "/Users/test/Library/pnpm/store";
  const getStore = "pnpm --dir /repo config get store-dir";

  it("applies only inside Codex shells", () => {
    expect(checkPnpmStore(machine())).toBeUndefined();
    expect(checkPnpmStore(machine({ env: { CODEX_THREAD_ID: "x" } }))?.status).toBe("wrong");
  });

  it("rejects the legacy npm_config_store_dir, which pnpm 11 ignores", () => {
    const legacy = machine({
      commands: { [getStore]: "/Users/test/Library/pnpm/store\n" },
      env: { CODEX_THREAD_ID: "x", npm_config_store_dir: store },
    });
    expect(checkPnpmStore(legacy)).toMatchObject({
      detail: expect.stringContaining("legacy") as string,
      status: "wrong",
    });
  });

  it("rejects a store inside the repository", () => {
    const local = machine({
      commands: { [getStore]: "/repo/.pnpm-store\n" },
      env: { CODEX_THREAD_ID: "x", pnpm_config_store_dir: "/repo/.pnpm-store" },
    });
    expect(checkPnpmStore(local)?.status).toBe("wrong");
  });

  it("rejects relative stores", () => {
    expect(
      checkPnpmStore(
        machine({
          env: { CODEX_THREAD_ID: "x", pnpm_config_store_dir: "../store" },
        }),
      )?.status,
    ).toBe("wrong");
  });

  it.each([store, join(store, "v11", "index.db")])("rejects an unwritable %s", (blocked) => {
    const result = checkPnpmStore(
      machine({
        env: { CODEX_THREAD_ID: "x", pnpm_config_store_dir: store },
        exists: () => true,
        writable: (path) => path !== blocked,
      }),
    );
    expect(result).toMatchObject({
      detail: `${blocked} is not writable from this shell`,
      status: "wrong",
    });
    expect(result?.fix).toContain("writable_roots");
    expect(result?.fix).toContain("docs/machine-setup.md");
  });

  it("requires pnpm's effective store to match the configured one", () => {
    const env = { CODEX_THREAD_ID: "x", pnpm_config_store_dir: store };
    const drifted = machine({ commands: { [getStore]: "/elsewhere\n" }, env });
    expect(checkPnpmStore(drifted)?.status).toBe("wrong");
    const matched = machine({ commands: { [getStore]: `${store}\n` }, env });
    expect(checkPnpmStore(matched)).toMatchObject({ detail: store, status: "ok" });
    expect(checkPnpmStore(machine({ env }))?.status).toBe("wrong");
  });
});

describe("report", () => {
  it("fails on missing or wrong results, not on manual ones", () => {
    expect(exitCode([{ detail: "", id: "a", label: "A", status: "manual" }])).toBe(0);
    expect(exitCode(runChecks(machine()))).toBe(1);
  });

  it("prints fixes for failures only", () => {
    const report = formatReport(runChecks(machine()));
    expect(report).toContain("[missing] pnpm");
    expect(report).toContain("fix: pnpm exec wrangler login");
    expect(report).toContain("[ok]      Node.js");
  });
});

describe("repository configuration", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));

  it("refuses to install dependencies implicitly before pnpm run or exec", () => {
    const workspace = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
    expect(workspace).toMatch(/^verifyDepsBeforeRun: error$/m);
  });

  it("offers no pnpm script for commands that must run before dependencies exist", () => {
    const { scripts } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(scripts).not.toHaveProperty("machine:doctor");
    expect(scripts).not.toHaveProperty("worktree:setup");
  });
});
