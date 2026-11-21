import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { trackedTestFiles } from "./tracked-test-files.js";

const repositories: string[] = [];

afterEach(() => {
  for (const directory of repositories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

const identity = ["-c", "user.name=Test", "-c", "user.email=test@example.com"];

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", [...identity, "-c", "commit.gpgsign=false", ...args], {
    cwd,
    stdio: "ignore",
  });
}

/** A repository with three committed test files, one in a subdirectory. */
function repository(): string {
  const cwd = mkdtempSync(join(tmpdir(), "mistria-tracked-tests-"));
  repositories.push(cwd);
  git(cwd, "init", "--quiet");
  mkdirSync(join(cwd, "src"));
  for (const file of ["a.test.ts", "b.test.ts", "src/c.test.ts", "helper.ts"]) {
    writeFileSync(join(cwd, file), "");
  }
  git(cwd, "add", ".");
  git(cwd, "commit", "--quiet", "-m", "Initial");
  return cwd;
}

describe("tracked test files", () => {
  it("lists committed test files in every directory", () => {
    expect(trackedTestFiles(repository())).toEqual(["a.test.ts", "b.test.ts", "src/c.test.ts"]);
  });

  it("drops a test file deleted from the working tree before the deletion is staged", () => {
    const cwd = repository();
    rmSync(join(cwd, "b.test.ts"));
    expect(trackedTestFiles(cwd)).toEqual(["a.test.ts", "src/c.test.ts"]);
  });

  it("drops the old path of an unstaged rename & ignores the untracked new path", () => {
    const cwd = repository();
    renameSync(join(cwd, "a.test.ts"), join(cwd, "d.test.ts"));
    expect(trackedTestFiles(cwd)).toEqual(["b.test.ts", "src/c.test.ts"]);
  });
});
