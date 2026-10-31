import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { agentToolHook, toolDirectories } from "./agent-tool-hook.js";

import type { HookInput } from "./lib/agent-hook.js";

const toolDirectory = (input: HookInput) => toolDirectories(input)[0];

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "agent-tool-hook-")));
  roots.push(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init");
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--allow-empty",
    "-m",
    "base",
  );
  const worktree = join(root, "linked tree");
  git("worktree", "add", "--detach", worktree);
  vi.stubEnv("CLAUDE_PROJECT_DIR", root);
  return { root, worktree };
}

const current = () => ({ installed: false, linked: 0, status: 0 });
const navigation = [
  "cd ~/Projects && ls",
  'cd "$TMPDIR" && ls',
  "cd scripts; ls",
  "cd - && ls",
  'cd "$(git rev-parse --show-toplevel)" && git status',
];
const shell = (cwd: string, command: string, hook_event_name = "PreToolUse"): HookInput => ({
  cwd,
  hook_event_name,
  tool_input: { command },
  tool_name: "Bash",
  tool_use_id: `hook-${cwd}-${command}`,
});

describe("toolDirectory", () => {
  it("uses the hook cwd for unified exec, including a per-call directory supplied by Codex", () => {
    expect(toolDirectory(shell("/repo/linked", "pnpm exec vitest"))).toBe("/repo/linked");
    expect(() => toolDirectory({ tool_name: "Bash" })).toThrow("Missing hook cwd");
  });

  it.each([
    ["cd '/repo/linked tree' && pnpm run check", "/repo/linked tree"],
    ["pnpm -C '/repo/linked tree' exec vitest", "/repo/linked tree"],
    ["pnpm --dir=/repo/linked exec vitest", "/repo/linked"],
    ['pnpm --dir=/repo/"linked tree" exec vitest', "/repo/linked tree"],
    ["pnpm --dir='/repo/linked tree' exec vitest", "/repo/linked tree"],
    ["cd '/repo/'\"linked tree\" && pnpm run check", "/repo/linked tree"],
    ["cd linked && cd src && pnpm run check", "/repo/linked/src"],
  ])("resolves a literal command directory: %s", (command, expected) => {
    expect(toolDirectory(shell("/repo", command))).toBe(expected);
  });

  it.each([
    "git pull && pnpm exec vitest",
    "cd /repo/linked | pnpm run check",
    "cd /repo/linked || pnpm run check",
    "git merge branch; pnpm run check",
    'cd "$WORKTREE" && pnpm run check',
    'pnpm -C "$(pwd)" run check',
    "cd ~/Projects && pnpm run check",
    "cd scripts; pnpm run check",
    "cd - && pnpm run check",
    'cd "$(git rev-parse --show-toplevel)" && pnpm run check',
  ])("rejects commands whose setup cannot be ordered safely: %s", (command) => {
    expect(() => toolDirectory(shell("/repo", command))).toThrow(
      /separate tool call|literal directory/,
    );
  });

  it.each(navigation)("keeps non-pnpm navigation available: %s", (command) => {
    expect(toolDirectories(shell("/repo", command))).toEqual(["/repo"]);
  });

  it("stops resolving after an unknown cd & keeps the last known directory", () => {
    expect(
      toolDirectories(shell("/repo", 'cd scripts && cd "$TMPDIR" && cd elsewhere && ls')),
    ).toEqual(["/repo/scripts"]);
  });

  it("does not reject an unknown cd after the last pnpm segment", () => {
    expect(toolDirectories(shell("/repo", 'pnpm run check && cd "$TMPDIR" && ls'))).toEqual([
      "/repo",
    ]);
  });

  it.each([
    "pnpm run lint:fix && pnpm run lint",
    "pnpm exec vitest run example.test.ts | tail",
    "pnpm install && pnpm run check",
    "git status && pnpm run check",
    "pnpm run check && git pull",
    "echo 'git pull' && pnpm run check",
    "git log --grep merge && pnpm run check",
  ])("allows compound commands without an earlier manifest-changing Git command: %s", (command) => {
    expect(toolDirectory(shell("/repo", command))).toBe("/repo");
  });

  it.each(["pull", "merge topic", "rebase main", "checkout topic", "switch topic"])(
    "rejects a Git operation before pnpm: %s",
    (operation) => {
      expect(() =>
        toolDirectory(shell("/repo", `git -C /repo ${operation} && pnpm run check`)),
      ).toThrow("separate tool call");
    },
  );

  it("rejects an incomplete quoted directory instead of choosing another checkout", () => {
    expect(() => toolDirectory(shell("/repo", 'pnpm --dir="/repo/linked run check'))).toThrow(
      "complete literal quotes",
    );
  });
});

describe("Shared agent tool upkeep", () => {
  it.each(navigation)("preserves formatter snapshots for non-pnpm navigation: %s", (command) => {
    const { root, worktree } = fixture();
    const setup = vi.fn(current);
    const input = shell(worktree, command);
    expect(agentToolHook(input, setup, undefined, root)).toEqual([]);
    expect(setup).toHaveBeenCalledExactlyOnceWith(worktree);
    writeFileSync(join(worktree, "new.ts"), "const value=1");
    const run = vi.fn(() => ({ output: "", status: 0 }));
    agentToolHook({ ...input, hook_event_name: "PostToolUse" }, setup, run, root);
    expect(setup).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledExactlyOnceWith(
      ["exec", "oxfmt", "--no-error-on-unmatched-pattern", "--", "new.ts"],
      worktree,
    );
  });

  it.each([
    (directory: string) => `pnpm --dir="${directory}" run check`,
    (directory: string) => `pnpm "--dir=${directory}" run check`,
    (directory: string) => `pnpm -C"${directory}" run check`,
    (directory: string) => `pnpm --filter app --dir="${directory}" run check`,
  ])("sets up the linked checkout for quoted directory options (%#)", (command) => {
    const { root, worktree } = fixture();
    const setup = vi.fn(current);
    const input = shell(root, command(worktree));
    agentToolHook(input, setup, undefined, root);
    expect(setup).toHaveBeenCalledExactlyOnceWith(worktree);
    agentToolHook({ ...input, hook_event_name: "PostToolUse" }, setup, undefined, root);
    expect(setup).toHaveBeenLastCalledWith(worktree);
  });

  it("sets up a linked checkout before the command & formats only after setup", () => {
    const { root, worktree } = fixture();
    const calls: string[] = [];
    let dependencyState = "stale";
    const setup = vi.fn((directory: string) => {
      expect(directory).toBe(worktree);
      calls.push("setup");
      dependencyState = "current";
      return { installed: true, linked: 2, status: 0 };
    });
    const input = shell(worktree, "git merge incoming");
    expect(agentToolHook(input, setup, undefined, root)).toEqual([
      expect.stringContaining("installed dependencies"),
    ]);
    writeFileSync(join(worktree, "new.ts"), "const value=1");
    dependencyState = "stale";
    const format = vi.fn((args: string[], cwd: string) => {
      expect(dependencyState).toBe("current");
      expect(cwd).toBe(worktree);
      expect(args).toEqual(["exec", "oxfmt", "--no-error-on-unmatched-pattern", "--", "new.ts"]);
      calls.push("format");
      return { output: "", status: 0 };
    });
    agentToolHook({ ...input, hook_event_name: "PostToolUse" }, setup, format, root);
    expect(calls).toEqual(["setup", "setup", "format"]);
    expect(format).toHaveBeenCalledTimes(1);
  });

  it("sets up before formatting a manifest patch", () => {
    const { root, worktree } = fixture();
    writeFileSync(join(worktree, "package.json"), "{}");
    const setup = vi.fn(current);
    const run = vi.fn(() => {
      expect(setup).toHaveBeenCalledTimes(1);
      return { output: "", status: 0 };
    });
    agentToolHook(
      {
        cwd: worktree,
        hook_event_name: "PostToolUse",
        tool_input: { command: "*** Update File: package.json\n" },
        tool_name: "apply_patch",
      },
      setup,
      run,
      root,
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(worktree, "package.json"), "utf8")).toBe("{}");
  });

  it("reports setup failures without invoking the formatter", () => {
    const { root, worktree } = fixture();
    const run = vi.fn();
    const setup = vi.fn(() => {
      throw new Error("frozen install failed");
    });
    expect(() => agentToolHook(shell(worktree, "pnpm exec vitest"), setup, run, root)).toThrow(
      "frozen install failed",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("does nothing in another repository or a directory without Git", () => {
    const { root } = fixture();
    const foreign = fixture().root;
    const setup = vi.fn(current);
    const run = vi.fn();
    expect(agentToolHook(shell(foreign, "git status"), setup, run, root)).toEqual([]);
    expect(agentToolHook(shell(foreign, "git pull && pnpm run check"), setup, run, root)).toEqual(
      [],
    );
    expect(agentToolHook(shell(tmpdir(), "ls"), setup, run, root)).toEqual([]);
    expect(setup).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    "node scripts/setup-worktree.ts",
    "node scripts/setup-worktree.ts --repair",
    "node scripts/machine-doctor.ts --for core",
  ])("lets explicit repair & diagnosis run without an automatic retry: %s", (command) => {
    const { root, worktree } = fixture();
    const setup = vi.fn(current);
    const input = shell(worktree, command);
    agentToolHook(input, setup, undefined, root);
    agentToolHook({ ...input, hook_event_name: "PostToolUse" }, setup, undefined, root);
    expect(setup).not.toHaveBeenCalled();
  });

  it("exits 2 with agent-visible diagnostics for an unsupported real hook payload", () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("agent-tool-hook.ts", import.meta.url))],
      {
        encoding: "utf8",
        input: JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_input: { command: "pnpm run check" },
          tool_name: "Bash",
        }),
      },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Missing hook cwd");
    expect(result.stderr).toContain("Report this before other work");
    expect(result.stdout).toBe("");
  });

  // Copilot CLI loads `.claude/settings.json` but sends its own payload schema (#286).
  it.each([
    { sessionId: "session", toolCalls: [{ args: { command: "pwd" }, id: "call", name: "bash" }] },
    { timestamp: 1, toolArgs: '{"command":"pwd"}', toolName: "bash" },
    { hook_event_name: "PreToolUse", tool_input: { command: "pwd" }, tool_name: "bash" },
  ])("lets another client’s shell call through untouched: %j", (payload) => {
    const { root } = fixture();
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("agent-tool-hook.ts", import.meta.url))],
      { cwd: root, encoding: "utf8", input: JSON.stringify({ ...payload, cwd: root }) },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("still rejects a named event it doesn’t handle", () => {
    const { root } = fixture();
    expect(() =>
      agentToolHook({ ...shell(root, "pwd"), hook_event_name: "Stop" }, current, undefined, root),
    ).toThrow("Unsupported agent tool hook event");
  });

  it("remains silent when no setup or formatting is needed", () => {
    const { root, worktree } = fixture();
    const input = shell(worktree, "git status");
    const setup = vi.fn(current);
    expect(agentToolHook(input, setup, undefined, root)).toEqual([]);
    expect(
      agentToolHook({ ...input, hook_event_name: "PostToolUse" }, setup, undefined, root),
    ).toEqual([]);
    expect(setup).toHaveBeenCalledTimes(2);
  });

  it.each(["Edit", "Write", "MultiEdit"])(
    "formats a %s without probing for ordinary source edits",
    (tool_name) => {
      const { root, worktree } = fixture();
      writeFileSync(join(worktree, "new.ts"), "const value=1");
      const setup = vi.fn(current);
      const run = vi.fn(() => ({ output: "", status: 0 }));
      agentToolHook(
        {
          cwd: worktree,
          hook_event_name: "PostToolUse",
          tool_input: { file_path: "new.ts" },
          tool_name,
        },
        setup,
        run,
        root,
      );
      expect(setup).not.toHaveBeenCalled();
      expect(run).toHaveBeenCalledExactlyOnceWith(
        ["exec", "oxfmt", "--no-error-on-unmatched-pattern", "--", "new.ts"],
        worktree,
      );
    },
  );

  it("accepts a notebook edit without probing", () => {
    const { root, worktree } = fixture();
    writeFileSync(join(worktree, "notes.ipynb"), "{}");
    const setup = vi.fn(current);
    expect(
      agentToolHook(
        {
          cwd: worktree,
          hook_event_name: "PostToolUse",
          tool_input: { notebook_path: "notes.ipynb" },
          tool_name: "NotebookEdit",
        },
        setup,
        undefined,
        root,
      ),
    ).toEqual([]);
    expect(setup).not.toHaveBeenCalled();
  });

  it.each([
    ["Edit", "package.json"],
    ["Write", "pnpm-lock.yaml"],
    ["MultiEdit", "pnpm-workspace.yaml"],
  ])("probes before formatting %s to %s", (tool_name, file_path) => {
    const { root, worktree } = fixture();
    writeFileSync(join(worktree, file_path), "{}");
    const setup = vi.fn(current);
    const run = vi.fn(() => {
      expect(setup).toHaveBeenCalledExactlyOnceWith(worktree);
      return { output: "", status: 0 };
    });
    agentToolHook(
      { cwd: worktree, hook_event_name: "PostToolUse", tool_input: { file_path }, tool_name },
      setup,
      run,
      root,
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("repairs & formats shell changes after Claude’s PostToolUseFailure", () => {
    const { root, worktree } = fixture();
    const setup = vi.fn(current);
    const input = shell(worktree, "git merge topic");
    agentToolHook(input, setup, undefined, root);
    writeFileSync(join(worktree, "new.ts"), "const value=1");
    const run = vi.fn(() => ({ output: "", status: 0 }));
    agentToolHook({ ...input, hook_event_name: "PostToolUseFailure" }, setup, run, root);
    expect(setup).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not probe for a nested manifest or a manifest name in patch content", () => {
    const { root, worktree } = fixture();
    mkdirSync(join(worktree, "nested"));
    writeFileSync(join(worktree, "nested/package.json"), "{}");
    writeFileSync(join(worktree, "new.ts"), "// package.json\n");
    const setup = vi.fn(current);
    const run = vi.fn(() => ({ output: "", status: 0 }));
    agentToolHook(
      {
        cwd: worktree,
        hook_event_name: "PostToolUse",
        tool_input: { file_path: "nested/package.json" },
        tool_name: "Edit",
      },
      setup,
      run,
      root,
    );
    agentToolHook(
      {
        cwd: worktree,
        hook_event_name: "PostToolUse",
        tool_input: { command: "*** Update File: new.ts\n+// package.json\n" },
        tool_name: "apply_patch",
      },
      setup,
      run,
      root,
    );
    expect(setup).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("probes once per checkout & keeps separate snapshots for a compound command across worktrees", () => {
    const { root, worktree } = fixture();
    const second = join(root, "second tree");
    execFileSync("git", ["worktree", "add", "--detach", second], { cwd: root, stdio: "pipe" });
    const setup = vi.fn(current);
    const input = shell(root, `pnpm -C "${worktree}" run check && pnpm -C "${second}" run check`);
    agentToolHook(input, setup, undefined, root);
    expect(setup.mock.calls).toEqual([[worktree], [second]]);
    writeFileSync(join(worktree, "first.ts"), "const first=1");
    writeFileSync(join(second, "second.ts"), "const second=1");
    const run = vi.fn(() => ({ output: "", status: 0 }));
    agentToolHook({ ...input, hook_event_name: "PostToolUse" }, setup, run, root);
    expect(setup.mock.calls).toEqual([[worktree], [second], [worktree], [second]]);
    expect(run.mock.calls).toEqual([
      [["exec", "oxfmt", "--no-error-on-unmatched-pattern", "--", "first.ts"], worktree],
      [["exec", "oxfmt", "--no-error-on-unmatched-pattern", "--", "second.ts"], second],
    ]);
  });
});
