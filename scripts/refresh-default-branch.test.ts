import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = readFileSync(new URL("refresh-default-branch.sh", import.meta.url), "utf8");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function gitIn(cwd: string, ...args: string[]) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function commit(cwd: string, content: string) {
  writeFileSync(join(cwd, "file"), content);
  gitIn(cwd, "add", ".");
  gitIn(
    cwd,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    content,
  );
}

function fixture(options: { detachMain?: boolean; missingRemote?: boolean } = {}) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "mistria-refresh-")));
  directories.push(directory);
  const origin = join(directory, "origin");
  const checkout = join(directory, "checkout");
  mkdirSync(origin);
  gitIn(origin, "init", "-q", "--initial-branch=main");
  commit(origin, "first\n");
  execFileSync("git", ["clone", "-q", origin, checkout]);
  if (options.detachMain) {
    gitIn(checkout, "switch", "-q", "--detach");
  }
  if (options.missingRemote) {
    gitIn(checkout, "remote", "set-url", "origin", join(directory, "missing"));
  }
  commit(origin, "second\n");
  const run = () =>
    spawnSync("bash", ["-c", script], {
      cwd: checkout,
      encoding: "utf8",
      env: { ...process.env, CLAUDE_CODE_REMOTE: "" },
    });
  return { checkout, git: (...args: string[]) => gitIn(checkout, ...args), origin, run };
}

describe("default-branch refresh", () => {
  it("fast-forwards a checked-out main without writing to stdout", () => {
    const { git, origin, run } = fixture();
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(git("rev-parse", "main")).toBe(
      execFileSync("git", ["-C", origin, "rev-parse", "main"], { encoding: "utf8" }).trim(),
    );
  });

  it("fast-forwards main as a ref when nothing has it checked out", () => {
    const { git, run } = fixture({ detachMain: true });
    expect(run().status).toBe(0);
    expect(git("rev-parse", "main")).toBe(git("rev-parse", "origin/main"));
  });

  it("leaves a diverged main alone and still exits 0", () => {
    const { checkout, git, run } = fixture();
    commit(checkout, "local\n");
    const before = git("rev-parse", "main");
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("could not fast-forward");
    expect(git("rev-parse", "main")).toBe(before);
  });

  it("exits 0 when the fetch fails", () => {
    const result = fixture({ missingRemote: true }).run();
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("could not fetch");
  });
});
