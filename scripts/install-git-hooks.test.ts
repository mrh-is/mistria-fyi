import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installGitHooks } from "./install-git-hooks.js";

describe("installGitHooks", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "mistria-hooks-"));
  });

  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
  });

  it("installs a runnable pre-commit hook without changing shared Git config", () => {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
    git("init", "--quiet");
    git("config", "--local", "core.hooksPath", ".husky/_");
    const config = join(root, ".git", "config");
    const before = readFileSync(config, "utf8");
    mkdirSync(join(root, ".husky"));
    writeFileSync(join(root, ".husky", "pre-commit"), "echo ran > hook-result\n");

    installGitHooks(root, undefined);
    installGitHooks(root, undefined);

    expect(readFileSync(config, "utf8")).toBe(before);
    git("hook", "run", "pre-commit");
    expect(readFileSync(join(root, "hook-result"), "utf8").trim()).toBe("ran");
  });

  it("honors HUSKY=0", () => {
    installGitHooks(root, "0");
    expect(() => readFileSync(join(root, ".husky", "_", "h"))).toThrow("ENOENT");
  });
});
