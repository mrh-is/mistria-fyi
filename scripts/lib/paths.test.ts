import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";

import { isInside, toPosixPath } from "./paths.js";

describe("path helpers", () => {
  it("converts platform separators without interpreting POSIX backslashes", () => {
    expect(toPosixPath(String.raw`items\crops`, win32)).toBe("items/crops");
    expect(toPosixPath(String.raw`items\crops`, posix)).toBe(String.raw`items\crops`);
  });

  it("recognizes Windows descendants with mixed separators & drive case", () => {
    expect(isInside(String.raw`c:\repo/worktree\src`, "C:/repo/worktree", win32)).toBe(true);
    expect(isInside("C:/repo/worktree", String.raw`c:\repo\worktree`, win32)).toBe(true);
    expect(isInside("D:/repo/worktree/src", "C:/repo/worktree", win32)).toBe(false);
  });

  it("rejects siblings, parents, & normalized escapes while accepting dot-prefixed children", () => {
    expect(isInside("/repo/worktree-other", "/repo/worktree", posix)).toBe(false);
    expect(isInside("/repo", "/repo/worktree", posix)).toBe(false);
    expect(isInside("/repo/worktree/../other", "/repo/worktree", posix)).toBe(false);
    expect(isInside("/repo/worktree/..cache", "/repo/worktree", posix)).toBe(true);
    expect(isInside("/repo/worktree/src", "/repo/worktree/", posix)).toBe(true);
  });
});
