import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { releaseGuardMessage } from "./guard-release-version.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});
const bash = (command: string, env: NodeJS.ProcessEnv = {}) =>
  releaseGuardMessage({ tool_input: { command }, tool_name: "Bash" }, env);

describe("release metadata guard", () => {
  it.each([
    "git tag v2.0.0",
    "git -c tag.gpgsign=false tag -a v2 -m release",
    "git tag -d v1",
    "git tag --sort=-version:refname v2.0.0",
    "git tag --format='%(refname:short)' -- v2.0.0",
    "git tag --list -d v1",
    "git tag --sort=-version:refname --force v2.0.0",
    "pnpm version patch",
    "pnpm pkg set version=2.0.0",
    "node -e 'writeFileSync(\"package.json\", data)'",
  ])("requires an inherited release opt-in: %s", (command) => {
    expect(bash(command)).toContain("MISTRIA_RELEASE");
    expect(bash(command, { MISTRIA_RELEASE: "1" })).toBeUndefined();
  });

  it.each([
    "git tag",
    "git tag --list 'v*'",
    "git tag -l",
    "git tag -v v1",
    "git tag --sort=-version:refname",
    "git tag --sort -version:refname",
    "git tag -n",
    "git tag -n3",
    "git tag --format='%(refname:short)'",
    "git tag --format '%(refname:short)'",
    "git tag --format '-date'",
    "git tag --column",
    "pnpm add example",
    "echo 'git tag v1'",
    "cat <<'EOF'\ngit tag v1\nEOF",
  ])("allows inspection and dependency changes: %s", (command) => {
    expect(bash(command)).toBeUndefined();
  });

  it.each([
    `node -e 'copyFileSync("package.json", join(dir, "package.json")); writeFileSync(join(dir, "pnpm-workspace.yaml"), workspace)'`,
    `node <<'NODE'\ncopyFileSync("package.json", join(dir, "package.json"));\ncopyFileSync("pnpm-lock.yaml", join(dir, "pnpm-lock.yaml"));\nwriteFileSync(join(dir, "pnpm-workspace.yaml"), workspace.replace(/auditConfig:.*/, ""));\nNODE`,
  ])("allows a manifest copy alongside a temporary workspace edit: %s", (command) => {
    expect(bash(command)).toBeUndefined();
  });

  it.each([
    `node -e 'writeFileSync(join(dir, "package.json"), data)'`,
    `node <<'NODE'\nwriteFileSync(join(dir, "package.json"), data);\nNODE`,
    `node -e 'const file = "package.json"; writeFileSync(join(dir, file), data)'`,
    `node -e 'writeFileSync(join(dir, "pnpm-workspace.yaml") + "package.json", data)'`,
    `node -e 'copyFileSync("package.json", join(dir, "package.json")); writeFileSync(file, data)'`,
    `node <<'NODE'\ncopyFileSync("other.json", "package.json");\nwriteFileSync("pnpm-workspace.yaml", "packages: []");\nNODE`,
    `node <<'NODE'\nrenameSync("other.json", "package.json");\nwriteFileSync("pnpm-workspace.yaml", "packages: []");\nNODE`,
    `node <<'NODE'\ncopyFileSync("package.json", join(dir, "package.json"));\nwriteFileSync(file, data);\nNODE`,
  ])("keeps manifest and unresolved writes guarded: %s", (command) => {
    expect(bash(command)).toContain("MISTRIA_RELEASE");
  });

  it("permits an executable audit fixture without changing either manifest version", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agent-audit-"));
    roots.push(cwd);
    const manifest = '{"name":"example","version":"1.0.0"}\n';
    writeFileSync(join(cwd, "package.json"), manifest);
    writeFileSync(join(cwd, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    writeFileSync(join(cwd, "pnpm-workspace.yaml"), "packages: []\nauditConfig: {}\n");
    const code = `
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = "fixture";
mkdirSync(dir);
copyFileSync("package.json", join(dir, "package.json"));
copyFileSync("pnpm-lock.yaml", join(dir, "pnpm-lock.yaml"));
const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
writeFileSync(join(dir, "pnpm-workspace.yaml"), workspace.replace(/auditConfig:.*\\n/, ""));
`;
    const input = {
      cwd,
      tool_input: { command: `node <<'NODE'\n${code}\nNODE` },
      tool_name: "Bash",
    };
    const guard = spawnSync("node", ["scripts/guard-release-version.ts"], {
      encoding: "utf8",
      env: { ...process.env, MISTRIA_RELEASE: "0" },
      input: JSON.stringify(input),
    });
    expect(guard.status, guard.stderr).toBe(0);
    const diagnostic = spawnSync("node", ["--input-type=module", "-e", code], {
      cwd,
      encoding: "utf8",
    });
    expect(diagnostic.status, diagnostic.stderr).toBe(0);
    expect(readFileSync(join(cwd, "package.json"), "utf8")).toBe(manifest);
    expect(readFileSync(join(cwd, "fixture", "package.json"), "utf8")).toBe(manifest);
    expect(readFileSync(join(cwd, "fixture", "pnpm-lock.yaml"), "utf8")).toBe(
      "lockfileVersion: '9.0'\n",
    );
    expect(readFileSync(join(cwd, "pnpm-workspace.yaml"), "utf8")).toContain("auditConfig");
    expect(readFileSync(join(cwd, "fixture", "pnpm-workspace.yaml"), "utf8")).toBe(
      "packages: []\n",
    );
  });

  it("compares the top-level version for Write, Edit, MultiEdit, and patch tools", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agent-version-"));
    roots.push(cwd);
    const before = '{"name":"example","version":"1.0.0","scripts":{}}\n';
    writeFileSync(join(cwd, "package.json"), before);
    const check = (tool_name: string, tool_input: object | string) =>
      releaseGuardMessage({ cwd, tool_input, tool_name }, {});
    expect(
      check("Write", { content: before.replace("1.0.0", "2.0.0"), file_path: "package.json" }),
    ).toContain("version");
    expect(
      check("Edit", { file_path: "package.json", new_string: "$&", old_string: "1.0.0" }),
    ).toContain("version");
    expect(
      check("Write", { content: before.replace("example", "renamed"), file_path: "package.json" }),
    ).toBeUndefined();
    expect(
      check("Edit", {
        file_path: "package.json",
        new_string: '"version":"2.0.0"',
        old_string: '"version":"1.0.0"',
      }),
    ).toContain("version");
    expect(
      check("Edit", {
        file_path: "package.json",
        new_string: '"name":"renamed"',
        old_string: '"name":"example"',
      }),
    ).toBeUndefined();
    expect(
      check("MultiEdit", {
        edits: [{ new_string: '"version":"2.0.0"', old_string: '"version":"1.0.0"' }],
        file_path: "package.json",
      }),
    ).toContain("version");
    writeFileSync(join(cwd, "package.json"), `${JSON.stringify(JSON.parse(before), null, 2)}\n`);
    expect(
      check(
        "apply_patch",
        '*** Begin Patch\n*** Update File: package.json\n@@\n-  "version": "1.0.0",\n+  "version": "2.0.0",\n*** End Patch',
      ),
    ).toContain("version");
    expect(
      check(
        "apply_patch",
        '*** Begin Patch\n*** Update File: package.json\n@@\n-  "name": "example",\n+  "name": "renamed",\n*** End Patch',
      ),
    ).toBeUndefined();
    expect(
      check("apply_patch", "*** Begin Patch\n*** Delete File: package.json\n*** End Patch"),
    ).toContain("version");
    expect(
      check("Write", { content: '{"version":"2"}', file_path: "another.json" }),
    ).toBeUndefined();
  });
});
