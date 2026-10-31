import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    "pnpm add example",
    "echo 'git tag v1'",
    "cat <<'EOF'\ngit tag v1\nEOF",
  ])("allows inspection and dependency changes: %s", (command) => {
    expect(bash(command)).toBeUndefined();
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
