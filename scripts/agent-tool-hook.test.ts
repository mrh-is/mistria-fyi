import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
  it.each(["Edit", "Write", "MultiEdit"])("formats a %s", (tool_name) => {
    const { root, worktree } = fixture();
    writeFileSync(join(worktree, "new.ts"), "const value=1");
    const run = vi.fn(() => ({ output: "", status: 0 }));
    agentToolHook(edit(worktree, "new.ts", tool_name), run, root);
    expect(run).toHaveBeenCalledExactlyOnceWith(...formatted("new.ts"), worktree);
  });

  it.each(["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"])(
    "only formats an edit to %s, with no install",
    (file_path) => {
      const { root, worktree } = fixture();
      writeFileSync(join(worktree, file_path), "{}");
      const run = vi.fn(() => ({ output: "", status: 0 }));
      agentToolHook(edit(worktree, file_path), run, root);
      expect(run).toHaveBeenCalledExactlyOnceWith(...formatted(file_path), worktree);
    },
  );

  it("hands back the formatter’s instructions without the stop & report wrapper", () => {
    const { root, worktree } = fixture();
    writeFileSync(join(worktree, "new.ts"), "const value=1");
    const run = vi.fn(() => ({ output: "ERR_PNPM_VERIFY_DEPS_BEFORE_RUN", status: 1 }));
    const message = agentToolHook(edit(worktree, "new.ts"), run, root);
    expect(message).toContain("node scripts/setup-worktree.ts");
    expect(message).not.toContain("Report");
  });

  it("accepts a notebook edit", () => {
    const { root, worktree } = fixture();
    writeFileSync(join(worktree, "notes.ipynb"), "{}");
    const input = {
      cwd: worktree,
      hook_event_name: "PostToolUse",
      tool_input: { notebook_path: "notes.ipynb" },
      tool_name: "NotebookEdit",
    };
    expect(() => {
      agentToolHook(input, undefined, root);
    }).not.toThrow();
  });

  it("formats nothing for a shell command", () => {
    const { root, worktree } = fixture();
    writeFileSync(join(worktree, "new.ts"), "const value=1");
    const run = vi.fn();
    const input = {
      cwd: worktree,
      hook_event_name: "PostToolUse",
      tool_input: { command: "echo x > new.ts" },
      tool_name: "Bash",
    };
    agentToolHook(input, run, root);
    expect(run).not.toHaveBeenCalled();
  });

  it("does nothing in another repository or a directory without Git", () => {
    const { root } = fixture();
    const foreign = fixture().root;
    writeFileSync(join(foreign, "package.json"), "{}");
    const run = vi.fn();
    agentToolHook(edit(foreign, "package.json"), run, root);
    agentToolHook(edit(tmpdir(), "a.ts"), run, root);
    expect(run).not.toHaveBeenCalled();
  });

  // Copilot 1.0.105 sends Claude-compatible events without a tool ID. The handler never reads the
  // ID; this guards against restoring the old early return for ID-less events with a session ID.
  it("formats Copilot’s Claude-compatible edit without a tool ID", () => {
    const { root, worktree } = fixture();
    writeFileSync(join(worktree, "new.ts"), "const value=1");
    const run = vi.fn(() => ({ output: "", status: 0 }));
    const input = {
      ...edit(worktree, "new.ts"),
      session_id: "copilot-session",
      timestamp: "2026-10-31T17:33:07.053Z",
    };
    agentToolHook(input, run, root);
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

  it("exits 2 with the formatter’s instructions when pnpm reports stale dependencies", () => {
    const { root } = fixture();
    const pnpm = join(root, "fake-pnpm.mjs");
    writeFileSync(
      pnpm,
      'console.error("[ERR_PNPM_VERIFY_DEPS_BEFORE_RUN] stale");\nprocess.exitCode = 1;\n',
    );
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "npm_execpath"),
    );
    const project = dirname(dirname(hookScript));
    const result = spawnSync(process.execPath, [hookScript], {
      cwd: project,
      encoding: "utf8",
      env: { ...env, CLAUDE_PROJECT_DIR: project, npm_execpath: pnpm },
      input: JSON.stringify(edit(project, "README.md")),
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("node scripts/setup-worktree.ts");
    expect(result.stderr).not.toContain("Report this before other work");
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
    expect(() => {
      agentToolHook({ ...edit(worktree, "a.ts"), hook_event_name: "PreToolUse" }, undefined, root);
    }).toThrow("Unsupported agent tool hook event");
  });
});
