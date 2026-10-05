import { describe, expect, it } from "vitest";

import {
  summarizePlaywrightReport,
  synchronizeAccessibilityIssue,
} from "./accessibility-monitor.js";

function report(message = "Accessibility violations:\nroute: /\nrule: color-contrast") {
  return { suites: [{ specs: [{ tests: [{ results: [{ errors: [{ message }] }] }] }] }] };
}

function rejectMutations(_command: string, args: string[]): Promise<string> {
  return args[1] === "list"
    ? Promise.resolve("[]")
    : Promise.reject(new Error("unexpected mutation"));
}

describe("accessibility issue monitor", () => {
  it("extracts bounded, actionable accessibility failures", () => {
    expect(summarizePlaywrightReport(report())).toEqual([
      "Accessibility violations:\nroute: /\nrule: color-contrast",
    ]);
  });

  it("creates one attributed issue using argument arrays and stdin", async () => {
    const calls: { args: string[]; input?: string }[] = [];
    const run = (_command: string, args: string[], input?: string): Promise<string> => {
      calls.push({ args, input });
      return Promise.resolve(args[1] === "list" ? "[]" : "");
    };
    await synchronizeAccessibilityIssue({
      report: report(),
      result: "failure",
      run,
      workflowUrl: "https://example.test/run/1",
    });
    expect(calls[1]?.args).toContain("create");
    expect(calls[1]?.args).toContain("agent: codex");
    expect(calls[1]?.input).toContain("route: /");
    expect(calls[1]?.input).toContain("Agent: codex");
  });

  it("comments on an existing issue instead of duplicating it", async () => {
    const calls: string[][] = [];
    const run = (_command: string, args: string[]): Promise<string> => {
      calls.push(args);
      return Promise.resolve(args[1] === "list" ? '[{"number":42}]' : "");
    };
    await synchronizeAccessibilityIssue({
      report: report(),
      result: "failure",
      run,
      workflowUrl: "https://example.test/run/2",
    });
    expect(calls[1]?.slice(0, 3)).toEqual(["issue", "comment", "42"]);
  });

  it("comments and closes an existing issue after recovery", async () => {
    const calls: string[][] = [];
    const run = (_command: string, args: string[]): Promise<string> => {
      calls.push(args);
      return Promise.resolve(args[1] === "list" ? '[{"number":42}]' : "");
    };
    await synchronizeAccessibilityIssue({
      result: "success",
      run,
      workflowUrl: "https://example.test/run/3",
    });
    expect(calls.map((args) => args[1])).toEqual(["list", "comment", "close"]);
  });

  it("rejects setup failures without mutating GitHub", async () => {
    await expect(
      synchronizeAccessibilityIssue({
        result: "failure",
        run: rejectMutations,
        workflowUrl: "run",
      }),
    ).rejects.toThrow("setup failed");
  });
});
