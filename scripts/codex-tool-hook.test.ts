import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { codexToolHook, toolDirectory } from "./codex-tool-hook.js";

import type { HookInput } from "./lib/agent-hook.js";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "codex-tool-hook-")));
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
    "pnpm install && pnpm run check",
    'cd "$WORKTREE" && pnpm run check',
    'pnpm -C "$(pwd)" run check',
  ])("rejects commands whose setup cannot be ordered safely: %s", (command) => {
    expect(() => toolDirectory(shell("/repo", command))).toThrow(
      /separate tool call|literal directory/,
    );
  });

  it("rejects an incomplete quoted directory instead of choosing another checkout", () => {
    expect(() => toolDirectory(shell("/repo", 'pnpm --dir="/repo/linked run check'))).toThrow(
      "complete literal quotes",
    );
  });
});

describe("Codex tool upkeep", () => {
  it.each([
    (directory: string) => `pnpm --dir="${directory}" run check`,
    (directory: string) => `pnpm "--dir=${directory}" run check`,
    (directory: string) => `pnpm -C"${directory}" run check`,
    (directory: string) => `pnpm --filter app --dir="${directory}" run check`,
  ])("sets up the linked checkout for quoted directory options (%#)", (command) => {
    const { root, worktree } = fixture();
    const setup = vi.fn(current);
    const input = shell(root, command(worktree));
    codexToolHook(input, setup, undefined, root);
    expect(setup).toHaveBeenCalledExactlyOnceWith(worktree);
    codexToolHook({ ...input, hook_event_name: "PostToolUse" }, setup, undefined, root);
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
    expect(codexToolHook(input, setup, undefined, root)).toEqual([
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
    codexToolHook({ ...input, hook_event_name: "PostToolUse" }, setup, format, root);
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
    codexToolHook(
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
    expect(() => codexToolHook(shell(worktree, "pnpm exec vitest"), setup, run, root)).toThrow(
      "frozen install failed",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("does nothing in another repository or a directory without Git", () => {
    const { root } = fixture();
    const foreign = fixture().root;
    const setup = vi.fn(current);
    const run = vi.fn();
    expect(codexToolHook(shell(foreign, "git status"), setup, run, root)).toEqual([]);
    expect(codexToolHook(shell(foreign, "git pull && pnpm run check"), setup, run, root)).toEqual(
      [],
    );
    expect(codexToolHook(shell(tmpdir(), "ls"), setup, run, root)).toEqual([]);
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
    codexToolHook(input, setup, undefined, root);
    codexToolHook({ ...input, hook_event_name: "PostToolUse" }, setup, undefined, root);
    expect(setup).not.toHaveBeenCalled();
  });

  it("exits 2 with agent-visible diagnostics for an unsupported real hook payload", () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("codex-tool-hook.ts", import.meta.url))],
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

  it("remains silent when no setup or formatting is needed", () => {
    const { root, worktree } = fixture();
    const input = shell(worktree, "git status");
    const setup = vi.fn(current);
    expect(codexToolHook(input, setup, undefined, root)).toEqual([]);
    expect(
      codexToolHook({ ...input, hook_event_name: "PostToolUse" }, setup, undefined, root),
    ).toEqual([]);
    expect(setup).toHaveBeenCalledTimes(2);
  });
});
