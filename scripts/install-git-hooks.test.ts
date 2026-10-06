import { describe, expect, it, vi } from "vitest";

import { installGitHooks } from "./install-git-hooks.js";

const LOCK_FAILURE = "error: could not lock config file .git/config: File exists\n";

describe("installGitHooks", () => {
  it("installs once when Husky succeeds", () => {
    const install = vi.fn(() => "");
    const wait = vi.fn();

    expect(installGitHooks(install, wait)).toEqual({ message: "", ok: true });
    expect(install).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("retries while another worktree holds the shared config lock", () => {
    const install = vi
      .fn()
      .mockReturnValueOnce(LOCK_FAILURE)
      .mockReturnValueOnce(LOCK_FAILURE)
      .mockReturnValueOnce("");
    const wait = vi.fn();

    expect(installGitHooks(install, wait)).toEqual({ message: "", ok: true });
    expect(install).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("fails once the lock never frees", () => {
    const install = vi.fn(() => LOCK_FAILURE);
    const wait = vi.fn();

    expect(installGitHooks(install, wait, 3)).toEqual({ message: LOCK_FAILURE, ok: false });
    expect(install).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("passes Husky's skip messages through without retrying", () => {
    const install = vi.fn(() => "HUSKY=0 skip install");
    const wait = vi.fn();

    expect(installGitHooks(install, wait)).toEqual({
      message: "HUSKY=0 skip install",
      ok: true,
    });
    expect(install).toHaveBeenCalledTimes(1);
  });
});
