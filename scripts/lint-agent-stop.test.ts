import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { stopLint } from "./lint-agent-stop.js";

describe("stop lint hook", () => {
  it("lints a SubagentStop worktree instead of the parent and continues only once", () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), "agent-stop-parent-")));
    const child = `${parent}-child`;
    const git = (...args: string[]) => {
      const result = spawnSync("git", args, { cwd: parent, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
    };
    try {
      git("init");
      writeFileSync(
        join(parent, "package.json"),
        JSON.stringify({
          scripts: {
            lint: "node lint.cjs",
            "lint:fix": "node lint.cjs",
          },
        }),
      );
      writeFileSync(
        join(parent, "lint.cjs"),
        'console.error("fixture lint error", process.cwd(), process.argv.slice(2)); process.exitCode = 1;',
      );
      git("add", ".");
      git(
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        "base",
      );
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      git("worktree", "add", "--detach", child);
      writeFileSync(join(parent, "parent.ts"), "parent change");
      writeFileSync(join(child, "child.ts"), "child change");
      for (const stop_hook_active of [false, true]) {
        const result = spawnSync(
          process.execPath,
          [fileURLToPath(new URL("lint-agent-stop.ts", import.meta.url))],
          {
            cwd: parent,
            encoding: "utf8",
            env: { ...process.env, CLAUDE_PROJECT_DIR: parent },
            input: JSON.stringify({
              agent_id: "fixture-agent",
              agent_transcript_path: "/unused/transcript.jsonl",
              agent_type: "general-purpose",
              cwd: child,
              hook_event_name: "SubagentStop",
              stop_hook_active,
            }),
          },
        );
        expect(result.status, result.stderr).toBe(0);
        const output = JSON.parse(result.stdout) as {
          decision?: string;
          reason?: string;
          systemMessage?: string;
        };
        expect(output.decision).toBe(stop_hook_active ? undefined : "block");
        const message = output.reason ?? output.systemMessage;
        expect(message).toContain("fixture lint error");
        expect(message).toContain(child);
        expect(message).toContain("child.ts");
        expect(message).not.toContain("parent.ts");
      }
    } finally {
      rmSync(parent, { force: true, recursive: true });
      rmSync(child, { force: true, recursive: true });
    }
  });

  it("silently skips an unrelated repository", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agent-stop-unrelated-"));
    try {
      const init = spawnSync("git", ["init"], { cwd, encoding: "utf8" });
      expect(init.status, init.stderr).toBe(0);
      const script = fileURLToPath(new URL("lint-agent-stop.ts", import.meta.url));
      const result = spawnSync(process.execPath, [script], {
        cwd,
        encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: fileURLToPath(new URL("..", import.meta.url)) },
        input: JSON.stringify({ cwd }),
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  });

  it.each([false, true])(
    "silently skips a non-repository cwd (active stop: %s)",
    (stop_hook_active) => {
      const cwd = mkdtempSync(join(tmpdir(), "agent-stop-outside-"));
      try {
        const result = spawnSync(
          process.execPath,
          [fileURLToPath(new URL("lint-agent-stop.ts", import.meta.url))],
          {
            cwd,
            encoding: "utf8",
            input: JSON.stringify({ cwd, stop_hook_active }),
          },
        );
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toBe("");
        expect(result.stderr).toBe("");
      } finally {
        rmSync(cwd, { force: true, recursive: true });
      }
    },
  );

  it("fixes changed files, then checks the same files, without shell interpolation", () => {
    const run = vi.fn(() => ({ output: "", status: 0 }));
    expect(stopLint({ cwd: "/work" }, ["a file.ts", "$(unsafe).md"], run)).toBeUndefined();
    expect(run.mock.calls).toEqual([
      [["run", "lint:fix", "--files", "a file.ts", "$(unsafe).md"], "/work"],
      [["run", "lint", "--files", "a file.ts", "$(unsafe).md"], "/work"],
    ]);
  });

  it("returns remaining lint errors to the agent & blocks the first stop", () => {
    const run = vi
      .fn()
      .mockReturnValueOnce({ output: "fix attempted", status: 0 })
      .mockReturnValueOnce({ output: "unfixable error", status: 1 });
    expect(stopLint({}, ["file.ts"], run)).toEqual({
      decision: "block",
      reason: expect.stringContaining("unfixable error"),
    });
  });

  it("still checks after fix failure, but reports without looping on an active stop", () => {
    const run = vi.fn(() => ({ output: "tool failed", status: 1 }));
    const output = stopLint({ stop_hook_active: true }, ["file.ts"], run);
    expect(output).toEqual({
      systemMessage: expect.stringContaining("finish with a failure report"),
    });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does nothing when the checkout & branch have no changes", () => {
    const run = vi.fn();
    expect(stopLint({}, [], run)).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });
});
