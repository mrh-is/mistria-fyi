import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { policyResult } from "./guard-agent-policy.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});
const check = (command: string, env: NodeJS.ProcessEnv = {}) =>
  policyResult({ cwd: "/work/mistria", tool_input: { command }, tool_name: "Bash" }, env);
const run = (command: string) =>
  spawnSync(process.execPath, ["scripts/guard-agent-policy.ts"], {
    encoding: "utf8",
    input: JSON.stringify({ tool_input: { command }, tool_name: "Bash" }),
  });

describe("agent shell policy", () => {
  it.each([
    "unzip assets.zip",
    "unzip -q /game/assets.zip -d /tmp/assets",
    "tar -xf assets.zip -C /tmp/assets",
    "7z x assets.zip",
    "7z x assets.zip '*'",
    "python3 - <<'EOF'\nimport zipfile\nzipfile.ZipFile('assets.zip').extractall('out')\nEOF",
    "unzip assets.zip '*'",
    "python3 -m zipfile -e assets.zip /tmp/assets",
    'python3 -c \'import zipfile; zipfile.ZipFile("assets.zip").extractall("out")\'',
  ])("requires approval for full asset extraction: %s", (command) => {
    expect(check(command).message).toContain("MISTRIA_ALLOW_FULL_ASSETS");
    expect(check(command, { MISTRIA_ALLOW_FULL_ASSETS: "1" }).message).toBeUndefined();
  });

  it.each([
    "unzip -l assets.zip",
    "unzip -t assets.zip",
    "tar -tf assets.zip",
    "7z l assets.zip",
    "unzip assets.zip 'assets/fiddle/*' -d /tmp/assets",
    "tar -xf assets.zip assets/fiddle",
    "unzip another.zip",
    "echo 'unzip assets.zip'",
    "cat <<'EOF'\nunzip assets.zip\nEOF",
  ])("allows asset inspection, subtrees, and ordinary text: %s", (command) => {
    expect(check(command).message).toBeUndefined();
  });

  it.each([
    "git stash",
    "git stash -u",
    "git stash --include-untracked",
    'echo "$(git stash pop)"',
    "x=$(git stash pop)",
    "git stash pop",
    "git -C /work stash pop stash@{0}",
    "git stash push",
    "git stash apply",
    "git stash apply stash@{0}",
    "git status && git stash pop",
    "bash <<'EOF'\ngit stash pop\nEOF",
    "cat <<'EOF' | bash\ngit stash pop\nEOF",
  ])("blocks ambiguous shared-stash operations: %s", (command) => {
    expect(check(command).message).toContain("stash");
  });

  it.each([
    "git stash push -m 'issue 298'",
    "git stash push --message=hooks -- scripts",
    "git stash -u -m 'hooks'",
    "git stash apply abc1234",
    "git stash list",
    "echo '$(git stash pop)'",
    "git stash show stash@{0}",
    "echo 'git stash pop'",
    "cat <<'EOF'\ngit stash pop\nEOF",
  ])("allows named pushes, explicit commits, and inspection: %s", (command) => {
    expect(check(command).message).toBeUndefined();
  });

  it("checks each segment without treating heredoc bodies as commands", () => {
    expect(check("git stash list; unzip assets.zip").message).toContain("assets.zip");
    expect(check("cat <<EOF\n$(git stash pop)\nEOF").message).toContain("stash");
    expect(check("bash -c 'git stash pop'").message).toContain("stash");
    expect(check("echo 'git stash pop'; pnpm add example").context).toContain("pnpm audit");
  });

  it("requires attributed GitHub bodies and body files for multiline text", () => {
    expect(check("gh issue create --title test --body 'hello'").message).toContain("Agent:");
    expect(check("gh pr comment 1 --body 'hello\nAgent: codex'").message).toContain("--body-file");
    expect(check("gh issue edit 1 --add-label ready").message).toBeUndefined();
    expect(check("gh pr create --fill").message).toContain("--body-file");
    expect(check("gh issue edit 1 --editor").message).toContain("--body-file");
    expect(
      check("gh issue comment 1 --body-file - <<'EOF'\nHello\n\nAgent: codex\nEOF").message,
    ).toBeUndefined();
    expect(check("gh issue comment 1 --body-file - <<'EOF'\nHello\nEOF").message).toContain(
      "Agent:",
    );
    expect(check("cat /tmp/body | gh issue comment 1 --body-file -").message).toContain("stdin");
  });

  it.each([
    "gh pr comment --help",
    "gh pr create -h",
    "gh issue create --help",
    "gh issue comment -h",
    "gh pr edit 332 --help",
    "gh issue edit 332 -h",
    "gh -R owner/repo pr comment 332 --help",
  ])("allows read-only GitHub help: %s", (command) => {
    expect(check(command).message).toBeUndefined();
  });

  it.each([
    "gh pr comment 332 --body --help",
    "gh issue create --title --help",
    "gh pr comment 332 -- --help",
    "gh pr comment 332 --body-file --help",
    "gh pr comment 332 --body=-h",
  ])("keeps help-like argument values subject to attribution: %s", (command) => {
    expect(check(command).message).toBeDefined();
  });

  it("still checks mutations after a help command", () => {
    expect(check("gh pr comment --help && gh pr comment 332").message).toContain("--body-file");
  });

  it("reads attributed body files, and rejects missing attribution without printing the body", () => {
    const root = mkdtempSync(join(tmpdir(), "agent-body-"));
    roots.push(root);
    const file = join(root, "body.md");
    writeFileSync(file, "A concrete change.\n\nAgent: codex\n");
    expect(
      check(`gh -R owner/repo pr create --title test --body-file '${file}'`).message,
    ).toBeUndefined();
    writeFileSync(file, "Private draft without attribution");
    const result = check(`gh issue edit 1 --body-file='${file}'`);
    expect(result.message).toContain("Agent:");
    expect(result.message).not.toContain("Private draft");
  });

  it("requires absolute body paths when commands change directory", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agent-body-cwd-"));
    roots.push(cwd);
    writeFileSync(join(cwd, "body.md"), "Attributed parent.\n\nAgent: codex\n");
    mkdirSync(join(cwd, "child"));
    writeFileSync(join(cwd, "child/body.md"), "Unattributed child.");
    const command = "cd child && gh issue comment 1 --body-file body.md";
    expect(policyResult({ cwd, tool_input: { command }, tool_name: "Bash" }, {}).message).toContain(
      "absolute",
    );
    expect(
      check(`cd /tmp && gh issue comment 1 --body-file '${join(cwd, "body.md")}'`).message,
    ).toBeUndefined();
  });

  it.each([
    "pnpm add example",
    "pnpm update",
    "pnpm remove example",
    "pnpm --filter pipeline add example",
  ])("adds audit context without denying dependency changes: %s", (command) => {
    expect(check(command)).toEqual({
      context: expect.stringContaining("pnpm audit --audit-level=moderate"),
    });
    expect(check(command).context).toContain("pnpm why");
    expect(check(command).context).toContain("auditConfig.ignoreGhsas");
  });

  it("returns denial or context over the stdin hook protocol", () => {
    const denied = run("git stash pop");
    expect(denied.status).toBe(2);
    expect(denied.stderr).toContain("stash");
    const allowed = run("pnpm add example");
    expect(allowed.status).toBe(0);
    expect(JSON.parse(allowed.stdout)).toMatchObject({
      hookSpecificOutput: {
        additionalContext: expect.stringContaining("pnpm audit"),
        hookEventName: "PreToolUse",
      },
    });
  });
});
