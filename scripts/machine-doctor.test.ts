import { describe, expect, it } from "vitest";

import {
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
  runChecks,
} from "./machine-doctor.js";

import type { CommandOutput, Environment } from "./machine-doctor.js";

const none: CommandOutput = { ok: false, stdout: "" };
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
    read: (path) => files[path.split("/").pop() ?? ""],
    root: "/repo",
    run: (command, args) => {
      const out = commands[[command, ...args].join(" ")];
      return out === undefined ? none : { ok: true, stdout: out };
    },
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
    expect(checkPnpm(machine())).toMatchObject({ status: "missing" });
  });

  it("flags a launcher whose major differs from the pin", () => {
    const result = checkPnpm(machine({ commands: { "pnpm --version": "10.0.0\n" } }));
    expect(result.status).toBe("wrong");
  });

  it("passes a matching major", () => {
    expect(checkPnpm(machine({ commands: { "pnpm --version": "11.28.2\n" } })).status).toBe("ok");
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

describe("checkPnpmStore", () => {
  it("applies only inside Codex shells", () => {
    expect(checkPnpmStore(machine())).toBeUndefined();
    const codex = machine({ env: { CODEX_THREAD_ID: "x" } });
    expect(checkPnpmStore(codex)?.status).toBe("wrong");
    const set = machine({ env: { CODEX_THREAD_ID: "x", npm_config_store_dir: "/tmp/s" } });
    expect(checkPnpmStore(set)?.status).toBe("ok");
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
