import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const helper = resolve("scripts/public-repo/rewrite-references.py");
const script = resolve("scripts/public-repo/build-candidate.sh");
const temporary: string[] = [];

function directory(): string {
  const path = mkdtempSync(join(tmpdir(), "public-candidate-test-"));
  temporary.push(path);
  return path;
}

function rewrite(text: string, message: boolean, mapping = ""): string {
  const path = directory();
  writeFileSync(
    join(path, "issues.json"),
    JSON.stringify([{ number: 1 }, { number: 2, pull_request: {} }]),
  );
  writeFileSync(join(path, "mapping.txt"), mapping);
  return execFileSync(
    "python3",
    [
      "-B",
      "-c",
      `
import importlib.util, sys
spec = importlib.util.spec_from_file_location("rewrite", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
rewriter = module.Rewriter(sys.argv[2], sys.argv[3])
sys.stdout.buffer.write(rewriter.rewrite(sys.stdin.buffer.read(), sys.argv[4] == "true"))
`,
      helper,
      join(path, "issues.json"),
      join(path, "mapping.txt"),
      String(message),
    ],
    {
      encoding: "utf8",
      input: text,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

afterEach(() => {
  for (const path of temporary.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});

describe("public candidate reference rewriting", () => {
  it("classifies known references and leaves unknown numbers & other repositories alone", () => {
    expect(
      rewrite(
        "Fix #1, mrh-is/mistria-fyi#2, other/repo#1, #999, and https://github.com/other/repo/issues/1",
        true,
      ),
    ).toBe(
      "Fix issue 1 (private beta), PR 2 (private beta), other/repo#1, #999, and https://github.com/other/repo/issues/1",
    );
    expect(rewrite("Merge pull request #2 from branch", true)).toBe(
      "Merge pull request 2 (private beta) from branch",
    );
  });

  it("rewrites only this repository’s URLs in file contents, preserving bare Markdown references", () => {
    expect(
      rewrite(
        "#1 mrh-is/mistria-fyi#2 issue 2 (private beta)
        false,
      ),
    ).toBe("#1 mrh-is/mistria-fyi#2 PR 2 (private beta)");
  });

  it("maps transferred issues once, even when the destination is another old number", () => {
    expect(rewrite("#1 #2 PR 1 (private beta)", true, "1 2\n")).toBe(
      "#2 PR 2 (private beta) issue 2 (private beta)",
    );
  });

  it("rejects duplicate mappings, nonexistent issues, and PR mappings", () => {
    for (const mapping of ["1 3\n1 4\n", "999 3\n", "2 3\n", "1 0\n"]) {
      expect(() => rewrite("#1", true, mapping)).toThrow("mapping");
    }
  });
});

describe("public candidate source validation", () => {
  it.each(["static/sprites/test.webp", "scripts/measure-transfer-size.ts"])(
    "rejects a source tip containing %s before cloning",
    (path) => {
      const source = directory();
      const git = (...args: string[]): string =>
        execFileSync("git", ["-C", source, ...args], { encoding: "utf8" });
      git("init", "--initial-branch=main");
      mkdirSync(join(source, path, ".."), { recursive: true });
      writeFileSync(join(source, path), "excluded");
      git("add", ".");
      git(
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.com",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        "Fixture",
      );
      const output = join(directory(), "candidate");
      const result = spawnSync("bash", [script, "--source", "HEAD", output], {
        cwd: source,
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(path.startsWith("static/") ? "static/sprites/" : path);
    },
  );
});

describe("public candidate history filtering", () => {
  const filterAvailable = spawnSync("git", ["filter-repo", "--version"]).status === 0;
  const scannerAvailable = spawnSync("gitleaks", ["version"]).status === 0;

  it.skipIf(!filterAvailable || !scannerAvailable)(
    "filters a main-only clone, audits its tree, and records message & blob rewrites",
    () => {
      const source = directory();
      const git = (...args: string[]): string =>
        execFileSync("git", ["-C", source, ...args], {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
        });
      const commit = (message: string): void => {
        git("add", "-A");
        git(
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.com",
          "-c",
          "commit.gpgsign=false",
          "commit",
          "-m",
          message,
        );
      };
      git("init", "--initial-branch=main");
      mkdirSync(join(source, "static/sprites"), { recursive: true });
      mkdirSync(join(source, "scripts"));
      writeFileSync(join(source, "static/sprites/old.webp"), "old sprite");
      writeFileSync(
        join(source, "scripts/measure-transfer-size.ts"),
        ["", "Users", "fixture", "private"].join("/"),
      );
      writeFileSync(join(source, "README.md"), "PR 1 (private beta)\n");
      commit("Fix #1");
      const first = git("rev-parse", "HEAD").trim();
      git("tag", "old-tag");
      git("branch", "other-branch");
      git("update-ref", "refs/pull/2/head", first);
      rmSync(join(source, "static"), { recursive: true });
      rmSync(join(source, "scripts"), { recursive: true });
      commit("Merge pull request #2 from fixture");
      const second = git("rev-parse", "HEAD").trim();
      // Model origin/main ahead of the maintainer’s local main.
      git("update-ref", "refs/remotes/origin/main", second);
      git("reset", "--hard", first);
      const scratch = directory();
      const issues = join(scratch, "issues.json");
      writeFileSync(issues, JSON.stringify([[{ number: 1 }, { number: 2, pull_request: {} }]]));
      const output = join(scratch, "candidate");
      const result = spawnSync("bash", [script, "--issues", issues, output], {
        cwd: source,
        encoding: "utf8",
      });
      expect(result.status, result.stderr + result.stdout).toBe(0);
      expect(
        execFileSync("git", ["-C", output, "for-each-ref", "--format=%(refname)"], {
          encoding: "utf8",
        }).trim(),
      ).toBe("refs/heads/main");
      expect(execFileSync("git", ["-C", output, "remote"], { encoding: "utf8" }).trim()).toBe("");
      expect(readFileSync(join(output, "README.md"), "utf8")).toBe("issue 1 (private beta)\n");
      const report = readFileSync(join(output, ".git/candidate-audit/rewrites.jsonl"), "utf8");
      expect(report).toContain('"path": "README.md"');
      expect(report).toContain(first);
      expect(report).toContain(second);
      expect(readFileSync(join(output, ".git/candidate-audit/summary.txt"), "utf8")).toContain(
        "PASS: gitleaks",
      );
      expect(git("rev-parse", "HEAD").trim()).toBe(first);
      // Tampering must fail the independent tip-tree audit, even if all reference audits pass.
      writeFileSync(join(output, "README.md"), "unexpected change\n");
      execFileSync("git", ["-C", output, "add", "README.md"]);
      execFileSync(
        "git",
        [
          "-C",
          output,
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.com",
          "-c",
          "commit.gpgsign=false",
          "commit",
          "-m",
          "Tamper",
        ],
        { stdio: "pipe" },
      );
      const audit = spawnSync("python3", ["-B", helper, "audit", source, second, output], {
        encoding: "utf8",
        env: { ...process.env, CANDIDATE_AUDIT_DIR: join(output, ".git/candidate-audit") },
      });
      expect(audit.status).not.toBe(0);
      expect(audit.stderr).toContain("tip tree equals source");
    },
  );
});

describe("public candidate independent audits", () => {
  it("rejects excluded historical paths even when retained paths share their blobs & trees", () => {
    const source = directory();
    const git = (...args: string[]): string =>
      execFileSync("git", ["-C", source, ...args], { encoding: "utf8", stdio: "pipe" });
    const commit = (): void => {
      git("add", "-A");
      git(
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.com",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        "Fixture",
      );
    };
    git("init", "--initial-branch=main");
    for (const path of ["retained", "static/sprites"]) {
      mkdirSync(join(source, path), { recursive: true });
      writeFileSync(join(source, path, "identical.txt"), "same bytes");
    }
    commit();
    rmSync(join(source, "static"), { recursive: true });
    commit();
    const auditDirectory = directory();
    writeFileSync(join(auditDirectory, "issues.json"), JSON.stringify([{ number: 1 }]));
    writeFileSync(join(auditDirectory, "mapping.txt"), "");
    const result = spawnSync("python3", ["-B", helper, "audit", source, "HEAD", source], {
      encoding: "utf8",
      env: { ...process.env, CANDIDATE_AUDIT_DIR: auditDirectory },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("excluded paths are unreachable");
  });
});

describe("public candidate secret scanning", () => {
  const scannerAvailable = spawnSync("gitleaks", ["version"]).status === 0;

  it.skipIf(!scannerAvailable)(
    "limits false-positive exceptions to exact identifiers & paths",
    () => {
      const fixture = directory();
      const config = resolve("scripts/public-repo/gitleaks.toml");
      const allowed = [
        ["src/lib/data/locales/fr/items.json", "mist_cushion_v1"],
        ["src/lib/data/locales/es/animals.json", "capybara/cosmetics/bow"],
        ["src/lib/data/locales/fr/animals.json", "rabbit/cosmetics/halo"],
        ["src/lib/stores/persistence-lifecycle.client.test.ts", "mistria-fyi-v1-quarantine"],
      ];
      const write = (path: string, value: string): void => {
        mkdirSync(join(fixture, path, ".."), { recursive: true });
        writeFileSync(join(fixture, path), `api_key = "${value}"\n`);
      };
      const scan = (): ReturnType<typeof spawnSync> =>
        spawnSync(
          "gitleaks",
          ["dir", ".", "--config", config, "--redact", "--no-banner", "--log-level", "error"],
          { cwd: fixture, encoding: "utf8" },
        );
      for (const [path, identifier] of allowed) {
        write(path, identifier);
      }
      const baseline = spawnSync(
        "gitleaks",
        ["dir", ".", "--redact", "--no-banner", "--log-level", "error"],
        { cwd: fixture, encoding: "utf8" },
      );
      expect(baseline.status).toBe(1);
      expect(scan().status).toBe(0);
      write("elsewhere.txt", "mistria-fyi-v1-quarantine");
      expect(scan().status).toBe(1);
      rmSync(join(fixture, "elsewhere.txt"));
      const syntheticToken = createHash("sha256")
        .update("public candidate detector regression")
        .digest("hex");
      for (const [path, identifier] of allowed) {
        write(path, syntheticToken);
        expect(scan().status, path).toBe(1);
        write(path, identifier);
      }
    },
  );
});
