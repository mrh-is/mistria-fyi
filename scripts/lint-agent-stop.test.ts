import { describe, expect, it, vi } from "vitest";

import { stopLint } from "./lint-agent-stop.js";

describe("stop lint hook", () => {
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
