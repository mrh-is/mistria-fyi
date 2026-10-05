import { describe, expect, it, vi } from "vitest";

import { formatAppVersion, getAppVersion } from "./app-version.js";

describe("formatAppVersion", () => {
  it("combines the commit date with a fixed-length commit identifier", () => {
    expect(formatAppVersion("2026-10-04", "abcdef1234567890abcdef1234567890abcdef12")).toBe(
      "2026.10.04 (abcdef12)",
    );
  });

  it.each([
    ["October 4, 2026", "abcdef1234567890abcdef1234567890abcdef12"],
    ["2026-10-04", "not-a-commit"],
  ])("rejects invalid Git metadata", (commitDate, commit) => {
    expect(() => formatAppVersion(commitDate, commit)).toThrow(/invalid git/i);
  });
});

describe("getAppVersion", () => {
  it("uses a stable local development identifier without invoking Git", () => {
    const readGit = vi.fn();

    expect(getAppVersion("development", readGit)).toBe("dev");
    expect(readGit).not.toHaveBeenCalled();
  });

  it("reads deterministic metadata from the production commit", () => {
    const readGit = vi
      .fn<(args: string[]) => string>()
      .mockReturnValueOnce("2026-10-04\n")
      .mockReturnValueOnce("abcdef1234567890abcdef1234567890abcdef12\n");

    expect(getAppVersion("production", readGit)).toBe("2026.10.04 (abcdef12)");
    expect(readGit).toHaveBeenNthCalledWith(1, ["show", "-s", "--format=%cs", "HEAD"]);
    expect(readGit).toHaveBeenNthCalledWith(2, ["rev-parse", "HEAD"]);
  });
});
