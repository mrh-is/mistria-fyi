import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { agentToolHook } from "./agent-tool-hook.js";

import type { HookInput } from "./lib/agent-hook.js";

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
const formatted = (file: string) => [
  ["exec", "oxfmt", "--no-error-on-unmatched-pattern", "--", file],
];
const edit = (cwd: string, file_path: string, tool_name = "Edit"): HookInput => ({
  cwd,
  hook_event_name: "PostToolUse",
  tool_input: { file_path },
  tool_name,
});
const hookScript = fileURLToPath(new URL("agent-tool-hook.ts", import.meta.url));

describe("Shared agent tool upkeep", () => {
  it.each(["Edit", "Write", "MultiEdit"])(
    "formats a %s without probing for ordinary source edits",
    (tool_name) => {
      const { root, worktree } = fixture();
      writeFileSync(join(worktree, "new.ts"), "const value=1");
      const setup = vi.fn(current);
      const run = vi.fn(() => ({ output: "", status: 0 }));
      agentToolHook(edit(worktree, "new.ts", tool_name), setup, run, root);
      expect(setup).not.toHaveBeenCalled();
      expect(run).toHaveBeenCalledExactlyOnceWith(...formatted("new.ts"), worktree);
    },
  );

  it.each([
    ["Edit", "package.json"],
    ["Write", "pnpm-lock.yaml"],
    ["MultiEdit", "pnpm-workspace.yaml"],
  ])("sets up before formatting %s to %s", (tool_name, file_path) => {
    const { root, worktree } = fixture();
    writeFileSync(join(worktree, file_path), "{}");
    const setup = vi.fn(current);
    const run = vi.fn(() => {
      expect(setup).toHaveBeenCalledExactlyOnceWith(worktree);
      return { output: "", status: 0 };
    });
    agentToolHook(edit(worktree, file_path, tool_name), setup, run, root);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("sets up before formatting a manifest patch, and reports the setup", () => {
    const { root, worktree } = fixture();
    writeFileSync(join(worktree, "package.json"), "{}");
    const setup = vi.fn(() => ({ installed: true, linked: 2, status: 0 }));
    const run = vi.fn(() => {
      expect(setup).toHaveBeenCalledTimes(1);
      return { output: "", status: 0 };
    });
    const messages = agentToolHook(
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
    expect(messages).toEqual([expect.stringContaining("installed dependencies")]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(worktree, "package.json"), "utf8")).toBe("{}");
  });

  it("reports setup failures without invoking the formatter", () => {
    const { root, worktree } = fixture();
    writeFileSync(join(worktree, "package.json"), "{}");
    const run = vi.fn();
    const setup = vi.fn(() => {
      throw new Error("frozen install failed");
    });
    expect(() => agentToolHook(edit(worktree, "package.json"), setup, run, root)).toThrow(
      "frozen install failed",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("does not probe for a nested manifest or a manifest name in patch content", () => {
    const { root, worktree } = fixture();
    mkdirSync(join(worktree, "nested"));
    writeFileSync(join(worktree, "nested/package.json"), "{}");
    writeFileSync(join(worktree, "new.ts"), "// package.json\n");
    const setup = vi.fn(current);
    const run = vi.fn(() => ({ output: "", status: 0 }));
    agentToolHook(edit(worktree, "nested/package.json"), setup, run, root);
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

  it("accepts a notebook edit without probing", () => {
    const { root, worktree } = fixture();
    writeFileSync(join(worktree, "notes.ipynb"), "{}");
    const setup = vi.fn(current);
    const input = {
      cwd: worktree,
      hook_event_name: "PostToolUse",
      tool_input: { notebook_path: "notes.ipynb" },
      tool_name: "NotebookEdit",
    };
    expect(agentToolHook(input, setup, undefined, root)).toEqual([]);
    expect(setup).not.toHaveBeenCalled();
  });

  it("formats nothing for a shell command", () => {
    const { root, worktree } = fixture();
    writeFileSync(join(worktree, "new.ts"), "const value=1");
    const setup = vi.fn(current);
    const run = vi.fn();
    const input = {
      cwd: worktree,
      hook_event_name: "PostToolUse",
      tool_input: { command: "echo x > new.ts" },
      tool_name: "Bash",
    };
    expect(agentToolHook(input, setup, run, root)).toEqual([]);
    expect(setup).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("does nothing in another repository or a directory without Git", () => {
    const { root } = fixture();
    const foreign = fixture().root;
    writeFileSync(join(foreign, "package.json"), "{}");
    const setup = vi.fn(current);
    const run = vi.fn();
    expect(agentToolHook(edit(foreign, "package.json"), setup, run, root)).toEqual([]);
    expect(agentToolHook(edit(tmpdir(), "a.ts"), setup, run, root)).toEqual([]);
    expect(setup).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  // Copilot 1.0.105 sends Claude-compatible events without a tool ID; edits don't need one.
  it("formats Copilot’s Claude-compatible edit without a tool ID", () => {
    const { root, worktree } = fixture();
    writeFileSync(join(worktree, "new.ts"), "const value=1");
    const run = vi.fn(() => ({ output: "", status: 0 }));
    const input = {
      ...edit(worktree, "new.ts"),
      session_id: "copilot-session",
      timestamp: "2026-10-31T17:33:07.053Z",
    };
    agentToolHook(input, current, run, root);
    expect(run).toHaveBeenCalledExactlyOnceWith(...formatted("new.ts"), worktree);
  });

  // Copilot CLI loads `.claude/settings.json` but can send its own payload schema (#286).
  it.each([
    { sessionId: "session", toolCalls: [{ args: { command: "pwd" }, id: "call", name: "bash" }] },
    { timestamp: 1, toolArgs: '{"command":"pwd"}', toolName: "bash" },
  ])("lets another client’s native payload through untouched: %j", (payload) => {
    const { root } = fixture();
    const result = spawnSync(process.execPath, [hookScript], {
      cwd: root,
      encoding: "utf8",
      input: JSON.stringify({ ...payload, cwd: root }),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("exits 2 with agent-visible diagnostics for a payload without a cwd", () => {
    const result = spawnSync(process.execPath, [hookScript], {
      encoding: "utf8",
      input: JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_input: { file_path: "a.ts" },
        tool_name: "Edit",
      }),
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Missing hook cwd");
    expect(result.stderr).toContain("Report this before other work");
    expect(result.stdout).toBe("");
  });

  it("still rejects a named event it doesn’t handle", () => {
    const { root, worktree } = fixture();
    expect(() =>
      agentToolHook(
        { ...edit(worktree, "a.ts"), hook_event_name: "PreToolUse" },
        current,
        undefined,
        root,
      ),
    ).toThrow("Unsupported agent tool hook event");
  });
});
