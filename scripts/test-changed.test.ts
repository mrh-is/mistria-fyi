import { describe, expect, it, vi } from "vitest";

import { parseBaseRef, planChangedTestRun } from "./test-changed.js";

import type { GitResult } from "./test-changed.js";

function result(status: number, stdout = "", stderr = ""): GitResult {
  return { status, stderr, stdout };
}

describe("planChangedTestRun", () => {
  it("falls back to the full suite when the comparison base is unavailable", () => {
    const runGit = vi.fn(() => result(1));

    expect(planChangedTestRun("origin/main", runGit)).toEqual({
      mode: "full",
      reason: "Git could not resolve origin/main to a commit.",
    });
    expect(runGit).toHaveBeenCalledTimes(1);
  });

  it("falls back to the full suite when Git cannot enumerate changes", () => {
    const runGit = vi
      .fn()
      .mockReturnValueOnce(result(0, "27d364b\n"))
      .mockReturnValueOnce(result(128, "", "fatal: bad revision"));

    expect(planChangedTestRun("origin/main", runGit)).toEqual({
      mode: "full",
      reason: "Git could not enumerate files changed from origin/main: fatal: bad revision",
    });
  });

  it("reports a clean branch instead of silently passing a zero-test run", () => {
    const runGit = vi.fn().mockReturnValueOnce(result(0, "27d364b\n")).mockReturnValue(result(0));

    expect(planChangedTestRun("origin/main", runGit)).toEqual({
      baseRef: "origin/main",
      changedFiles: [],
      mode: "none",
    });
  });

  it("selects affected tests for committed, staged, modified, and untracked files", () => {
    const runGit = vi
      .fn()
      .mockReturnValueOnce(result(0, "27d364b\n"))
      .mockReturnValueOnce(result(0, "src/lib/engine/search.ts\n"))
      .mockReturnValueOnce(result(0, "src/lib/engine/search.test.ts\n"))
      .mockReturnValueOnce(
        result(0, "src/lib/engine/search.ts\nsrc/lib/engine/search.client.test.ts\n"),
      );

    expect(planChangedTestRun("origin/main", runGit)).toEqual({
      baseRef: "origin/main",
      changedFiles: [
        "src/lib/engine/search.client.test.ts",
        "src/lib/engine/search.test.ts",
        "src/lib/engine/search.ts",
      ],
      mode: "changed",
    });
  });

  it.each(["package.json", "pnpm-lock.yaml", "vite.config.ts", "src/vitest-setup.ts"])(
    "runs the full suite when %s changes",
    (changedFile) => {
      const runGit = vi
        .fn()
        .mockReturnValueOnce(result(0, "27d364b\n"))
        .mockReturnValueOnce(result(0, `${changedFile}\n`))
        .mockReturnValue(result(0));

      expect(planChangedTestRun("origin/main", runGit)).toEqual({
        mode: "full",
        reason: `${changedFile} can affect test discovery or every test project.`,
      });
    },
  );
});

describe("parseBaseRef", () => {
  it("accepts pnpm's optional argument separator", () => {
    expect(parseBaseRef(["--", "HEAD"])).toBe("HEAD");
    expect(parseBaseRef(["main"])).toBe("main");
    expect(parseBaseRef([])).toBe("origin/main");
  });
});
