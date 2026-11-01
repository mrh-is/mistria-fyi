import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { namesR2TokenFile, readGuardMessage } from "./guard-generated-reads.js";

const roots: string[] = [];
const search = (command: string, cwd: string) =>
  readGuardMessage({ cwd, tool_input: { command }, tool_name: "Bash" });
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("generated-data read guard", () => {
  it("denies Read & direct shell reads, with a short recovery instruction", () => {
    for (const input of [
      { tool_input: { file_path: "src/lib/data/tracker-data.json" }, tool_name: "Read" },
      { tool_input: { command: 'cat "src/lib/data/tracker-data.json"' }, tool_name: "Bash" },
      { tool_input: { command: "jq . <src/lib/data/tracker-data.json" }, tool_name: "Bash" },
      { tool_input: { command: "head src/lib/data/../data/tracker-data.json" }, tool_name: "Bash" },
    ]) {
      expect(readGuardMessage({ cwd: "/work/mistria", ...input })).toContain("Read src/lib/types");
    }
  });

  it("allows types, source, lookalikes, and commands that only mention the rule", () => {
    expect(
      readGuardMessage({ tool_input: { file_path: "src/lib/data/tracker-data.json.md" } }),
    ).toBeUndefined();
    expect(
      readGuardMessage({ tool_input: { file_path: "src/lib/types/tracker-data.ts" } }),
    ).toBeUndefined();
    expect(
      readGuardMessage({
        tool_input: { command: 'echo "src/lib/data/tracker-data.json"' },
        tool_name: "Bash",
      }),
    ).toBeUndefined();
  });

  it("denies reads in any segment, fed heredocs, & dynamic targets", () => {
    for (const command of [
      "ls src; cat src/lib/data/tracker-data.json",
      "git status && wc -c < src/lib/data/tracker-data.json",
      "echo <(cat src/lib/data/tracker-data.json)",
      "bash <<'EOF'\njq . src/lib/data/tracker-data.json\nEOF",
      "python3 - <<'EOF'\nprint(open('src/lib/data/tracker-data.json').read())\nEOF",
      "node -e 'readFileSync(\"src/lib/data/tracker-data.json\")'",
      "f=src/lib/data/tracker-data.json; head $f",
      "echo src/lib/data/tracker-data.json | xargs cat",
      "xargs cat <<EOF\nsrc/lib/data/tracker-data.json\nEOF",
      "bash <<'EOF' 2>&1 | tail -20\ncat src/lib/data/tracker-data.json\nEOF",
      "bash <<'EOF' && echo done\nhead -c 100 src/lib/data/tracker-data.json\nEOF",
      "python3 -m json.tool src/lib/data/tracker-data.json | head -50",
      "xxd src/lib/data/tracker-data.json",
      "exec 3<>src/lib/data/tracker-data.json; cat <&3",
      "cat <<'EOF' | bash\ncat src/lib/data/tracker-data.json\nEOF",
      "cat <<'EOF' | python3 -\nopen('src/lib/data/tracker-data.json')\nEOF",
      "cat <<EOF\n$(cat src/lib/data/tracker-data.json )\nEOF",
      "gh pr comment 1 --body-file - <<EOF\nsize: `wc -c < src/lib/data/tracker-data.json`\nEOF",
    ]) {
      expect(
        readGuardMessage({ cwd: "/work/mistria", tool_input: { command }, tool_name: "Bash" }),
        command,
      ).toContain("Read src/lib/types");
    }
  });

  it("allows commands whose reads are in segments that never name the data", () => {
    for (const command of [
      "git check-attr linguist-generated src/lib/data/tracker-data.json; python3 - <<'EOF'\nprint(1)\nEOF\nrg -n \"pipeline/output/tracker|minified\" docs",
      "cat >> .gitattributes <<'EOF'\nsrc/lib/data/tracker-data.json linguist-generated=true\nEOF",
      "cat <<EOF\nsrc/lib/data/tracker-data.json\nEOF",
      "cat <<'EOF'\n$(cat src/lib/data/tracker-data.json)\nEOF",
      "git check-attr -a src/lib/data/tracker-data.json; rg -n 'end$' docs",
      "gh pr comment 1 --body-file - <<'EOF'\nopen('src/lib/data/tracker-data.json') failed\nEOF",
      "git log --oneline -- src/lib/data/tracker-data.json | head -5",
      "grep x <<< src/lib/data/tracker-data.json",
      "pnpm exec oxfmt --check src/lib/data/tracker-data.json && cat README.md",
    ]) {
      expect(
        readGuardMessage({ cwd: "/work/mistria", tool_input: { command }, tool_name: "Bash" }),
        command,
      ).toBeUndefined();
    }
  });

  it("resolves file-tool & shell symlinks", () => {
    const root = mkdtempSync(join(tmpdir(), "agent-read-"));
    roots.push(root);
    mkdirSync(join(root, "src/lib/data"), { recursive: true });
    writeFileSync(join(root, "src/lib/data/tracker-data.json"), "{}");
    symlinkSync(join(root, "src/lib/data"), join(root, "alias"), "junction");
    expect(
      readGuardMessage({ cwd: root, tool_input: { file_path: "alias/tracker-data.json" } }),
    ).toBeDefined();
    expect(
      readGuardMessage({
        cwd: root,
        tool_input: { command: "cat alias/tracker-data.json" },
        tool_name: "Bash",
      }),
    ).toBeDefined();
  });

  it("denies reads of stored OAuth token files, with a recovery instruction", () => {
    const tokenMessage =
      "Blocked read of a stored OAuth token file. Use `gh auth status` or `pnpm exec wrangler whoami` instead.";
    expect(readGuardMessage({ tool_input: { file_path: "/Users/me/.config/gh/hosts.yml" } })).toBe(
      tokenMessage,
    );
    expect(
      readGuardMessage({
        cwd: "/work/mistria",
        tool_input: { command: "cat ~/.config/gh/hosts.yml" },
        tool_name: "Bash",
      }),
    ).toBe(tokenMessage);
    expect(
      readGuardMessage({
        cwd: "/work/mistria",
        tool_input: { command: "cat ~/Library/Preferences/.wrangler/config/default.toml" },
        tool_name: "Bash",
      }),
    ).toBe(tokenMessage);
  });

  it("denies reads of the R2 upload token file, but not other env files", () => {
    const tokenMessage =
      "Blocked read of the R2 upload token file. The upload scripts load it; check it with `node scripts/machine-doctor.ts --for release` or `pnpm run r2:check`. To search the repository, use the Grep tool or plain `rg`, which skip gitignored files.";
    expect(readGuardMessage({ tool_input: { file_path: "/work/mistria/.env.r2-upload" } })).toBe(
      tokenMessage,
    );
    expect(
      readGuardMessage({
        cwd: "/work/mistria",
        tool_input: { command: "cat .env.r2-upload" },
        tool_name: "Bash",
      }),
    ).toBe(tokenMessage);
    expect(
      readGuardMessage({ tool_input: { file_path: "/work/mistria/.env.example" } }),
    ).toBeUndefined();
  });

  it("denies other spellings, globs, PowerShell, & Grep filters that reach the R2 token file", () => {
    for (const input of [
      { tool_input: { file_path: String.raw`C:\work\mistria\.ENV.R2-UPLOAD` }, tool_name: "Read" },
      { tool_input: { command: "cat .env.r2-upload." }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-upload::$DATA" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2*" }, tool_name: "Bash" },
      { tool_input: { command: "type .env.r2-upload" }, tool_name: "Bash" },
      { tool_input: { command: 'powershell -c "Get-Content .env.r2-upload"' }, tool_name: "Bash" },
      { tool_input: { command: String.raw`gc .\.env.r2-upload` }, tool_name: "PowerShell" },
      { tool_input: { glob: ".env*", pattern: "TOKEN" }, tool_name: "Grep" },
    ]) {
      expect(readGuardMessage({ cwd: "/work/mistria", ...input }), JSON.stringify(input)).toContain(
        "R2 upload token file",
      );
    }
    for (const input of [
      { tool_input: { command: "cat *.md" }, tool_name: "Bash" },
      { tool_input: { command: "Get-Content README.md" }, tool_name: "PowerShell" },
      { tool_input: { glob: "*.ts", pattern: "R2_UPLOAD_TOKEN" }, tool_name: "Grep" },
    ]) {
      expect(
        readGuardMessage({ cwd: "/work/mistria", ...input }),
        JSON.stringify(input),
      ).toBeUndefined();
    }
  });

  it("allows jq slices & indexes that only look like dotfile globs", () => {
    for (const command of [
      "gh run list --json a --jq '.a | sort | .[0:8]'",
      "gh api \"a/$ID\" --jq '{type}'; gh run list --jq '.b[0:8]'",
      "gh run list --json a --jq '.b[0:8]'",
      "gh run list --json a --jq 'map(.a) | sort | .b'",
      "gh api \"a/$ID\" --jq '{type}'; gh run list --jq '.b'",
      "jq '.[]' data.json",
      "jq '.[].a' data.json",
      "jq '.[0]' data.json",
      "jq '.[length-1]' data.json",
      "jq '.[0:length-1]' data.json",
      "jq '.foo[1:]' data.json",
      "jq '.foo[:2]' data.json",
      "jq '.foo[.n-1]' data.json",
      "jq '.a[0' data.json",
      "jq '.b[(.a)]' data.json",
    ]) {
      expect(
        readGuardMessage({ cwd: "/work/mistria", tool_input: { command }, tool_name: "Bash" }),
        command,
      ).toBeUndefined();
    }
  });

  it("keeps denying a bracket split where the rest could still reach the R2 token file", () => {
    // These can be fragments of `.["e "]nv.r2-upload`, so a jq computed index shares their fate.
    for (const command of ["jq '.[(.a)]' data.json", "jq '.[\"key\"]' data.json"]) {
      expect(
        readGuardMessage({ cwd: "/work/mistria", tool_input: { command }, tool_name: "Bash" }),
        command,
      ).toContain("R2 upload token file");
    }
  });

  it("answers quickly on long hostile words, so a hook timeout can't skip the guard", () => {
    for (const word of [
      `x${"[".repeat(100_000)}`,
      `.${"[".repeat(100_000)}`,
      `.[${"[:".repeat(50_000)}`,
      `.${"[]".repeat(50_000)}`,
      `.${"*?".repeat(50_000)}x`,
      `${".".repeat(100_000)}x`,
    ]) {
      const start = performance.now();
      namesR2TokenFile(word);
      expect(performance.now() - start, word.slice(0, 8)).toBeLessThan(2000);
    }
  });

  it("denies bracket globs that match the R2 token file, even around a colon or separator", () => {
    for (const input of [
      { tool_input: { command: "cat .env.r2-uploa[d]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uploa[a:d]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .e[m:n]v.r2-upload" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uploa[[:alpha:]]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uploa[[.d.]]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uploa[d,e]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uploa[c-e]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uploa[!x]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uploa[^x]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uploa[]d]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uploa[d]:$DATA" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uploa[z-a]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .[e]nv*" }, tool_name: "Bash" },
      // Zsh matches any character with an empty negated bracket.
      { tool_input: { command: "cat .env.r2-uploa[!]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2[^]upload" }, tool_name: "Bash" },
      // Lowercasing must not change what a negated or ranged bracket matches.
      { tool_input: { command: "cat .env.r2-uploa[!D]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uploa[^D]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uploa[!A-Z]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .e[!N]v.r2-upload" }, tool_name: "Bash" },
      { tool_input: { command: "cat .[E-z]nv.r2-upload" }, tool_name: "Bash" },
      // Quoted members split the word, leaving an unclosed bracket.
      { tool_input: { command: 'cat .env.r2-uploa["d e"]' }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uploa['d e']" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uploa[d' ']" }, tool_name: "Bash" },
      { tool_input: { command: 'cat .env.r2-uploa[d";"]' }, tool_name: "Bash" },
      { tool_input: { command: 'cat .e["n "]v.r2-upload' }, tool_name: "Bash" },
      { tool_input: { command: 'cat .["e "]nv*' }, tool_name: "Bash" },
      // Collating symbols & equivalence classes can hold punctuation, even a `]`.
      { tool_input: { command: "cat .env.r2[[.-.]]upload" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env[[...]]r2-upload" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env[[=.=]]r2-upload" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uploa[[.].]d]" }, tool_name: "Bash" },
      // Zsh has no collating symbols, so `[[.]` closes at its first `]` there.
      { tool_input: { command: "cat .env[[.]r2-uplo[a.][d]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env[[=]r2-uplo[a=][d]" }, tool_name: "Bash" },
      { tool_input: { command: "cat .env.r2-uplo[]a[.]d" }, tool_name: "Bash" },
      // PowerShell wildcards have no negation, so `!` & `^` are members there.
      { tool_input: { command: "gc .env.r2-uploa[!d]" }, tool_name: "PowerShell" },
      { tool_input: { command: 'powershell -c "gc .env.r2-uploa[^d]"' }, tool_name: "Bash" },
      { tool_input: { command: 'powershell -c "gc a[ .env.r2-uploa[d,e]"' }, tool_name: "Bash" },
      { tool_input: { glob: ".env.r2-uploa[!D]", pattern: "TOKEN" }, tool_name: "Grep" },
      {
        tool_input: { command: 'powershell -c "Get-Content .env.r2-uploa[d,e]"' },
        tool_name: "Bash",
      },
      {
        tool_input: { command: 'powershell -c "Get-Content .env.r2-uploa[a:d]"' },
        tool_name: "Bash",
      },
      {
        tool_input: { command: 'powershell -c "gc a[ .env.r2-upload; echo ]"' },
        tool_name: "Bash",
      },
      { tool_input: { command: "gc .env.r2-uploa[d,e]" }, tool_name: "PowerShell" },
      { tool_input: { glob: ".env.r2-uploa[a:d]", pattern: "TOKEN" }, tool_name: "Grep" },
    ]) {
      expect(readGuardMessage({ cwd: "/work/mistria", ...input }), JSON.stringify(input)).toContain(
        "R2 upload token file",
      );
    }
    for (const command of [
      "cat .env.r2-uplo[a]",
      "cat .env.r2-upload[a]",
      "cat .envrc[0]",
      "cat .env.example[",
    ]) {
      expect(
        readGuardMessage({ cwd: "/work/mistria", tool_input: { command }, tool_name: "Bash" }),
        command,
      ).toBeUndefined();
    }
  });

  it("denies recursive searches that read gitignored files only where the token file is in reach", () => {
    const root = mkdtempSync(join(tmpdir(), "agent-read-"));
    roots.push(root);
    expect(spawnSync("git", ["init", "-q"], { cwd: root }).status).toBe(0);
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, ".env.r2-upload"), "R2_UPLOAD_TOKEN=synthetic\n");
    for (const command of [
      "grep -rn R2_UPLOAD_TOKEN .",
      "grep -R TOKEN",
      "rg -uu R2_UPLOAD_TOKEN",
      "git grep --no-index TOKEN",
    ]) {
      expect(search(command, root), command).toContain("R2 upload token file");
    }
    expect(search("rg R2_UPLOAD_TOKEN", root)).toBeUndefined();
    expect(search("grep -rn R2_UPLOAD_TOKEN src", root)).toBeUndefined();
    expect(search("grep -rn R2_UPLOAD_TOKEN .", join(root, "src"))).toBeUndefined();
    expect(search("grep -rn R2_UPLOAD_TOKEN ..", join(root, "src"))).toContain(
      "R2 upload token file",
    );
  });

  it("denies recursive searches that reach the token file through a symlinked path", () => {
    const parent = mkdtempSync(join(tmpdir(), "agent-read-"));
    roots.push(parent);
    const root = join(parent, "checkout");
    const alias = join(parent, "alias");
    mkdirSync(join(root, "src"), { recursive: true });
    expect(spawnSync("git", ["init", "-q"], { cwd: root }).status).toBe(0);
    writeFileSync(join(root, ".env.r2-upload"), "R2_UPLOAD_TOKEN=synthetic\n");
    symlinkSync(root, alias);

    expect(search("grep -rn R2_UPLOAD_TOKEN .", alias)).toContain("R2 upload token file");
    expect(search("grep -R TOKEN", alias)).toContain("R2 upload token file");
    expect(search("grep -rn R2_UPLOAD_TOKEN ..", join(alias, "src"))).toContain(
      "R2 upload token file",
    );
    expect(search("grep -rn R2_UPLOAD_TOKEN .", join(alias, "src"))).toBeUndefined();
    expect(search("rg R2_UPLOAD_TOKEN", alias)).toBeUndefined();
  });

  it("denies recursive searches when the token file itself is a symlink out of the checkout", () => {
    const parent = mkdtempSync(join(tmpdir(), "agent-read-"));
    roots.push(parent);
    const root = join(parent, "checkout");
    const secret = join(parent, "synthetic-r2-token");
    mkdirSync(root);
    expect(spawnSync("git", ["init", "-q"], { cwd: root }).status).toBe(0);
    writeFileSync(secret, "R2_UPLOAD_TOKEN=synthetic\n");
    symlinkSync(secret, join(root, ".env.r2-upload"));

    expect(search("grep -R TOKEN .", root)).toContain("R2 upload token file");
    expect(search("grep -rn TOKEN", root)).toContain("R2 upload token file");
  });

  it("denies token paths even when their files are symlinked elsewhere", () => {
    const root = mkdtempSync(join(tmpdir(), "agent-read-"));
    roots.push(root);
    const tokenPath = join(root, ".config/gh/hosts.yml");
    const targetPath = join(root, "synthetic-config.yml");
    mkdirSync(join(root, ".config/gh"), { recursive: true });
    writeFileSync(targetPath, "synthetic token");
    symlinkSync(targetPath, tokenPath);

    expect(readGuardMessage({ cwd: root, tool_input: { file_path: tokenPath } })).toBeDefined();
    expect(
      readGuardMessage({
        cwd: root,
        tool_input: { command: "cat .config/gh/hosts.yml" },
        tool_name: "Bash",
      }),
    ).toBeDefined();
  });

  it("allows other gh & wrangler config files", () => {
    expect(
      readGuardMessage({ tool_input: { file_path: ".config/gh/config.yml" } }),
    ).toBeUndefined();
    expect(
      readGuardMessage({
        cwd: "/work/mistria",
        tool_input: { command: "cat wrangler.toml" },
        tool_name: "Bash",
      }),
    ).toBeUndefined();
  });

  it("returns the blocking exit code & reason over the real stdin protocol", () => {
    const result = spawnSync(process.execPath, ["scripts/guard-generated-reads.ts"], {
      encoding: "utf8",
      input: JSON.stringify({ tool_input: { file_path: "src/lib/data/tracker-data.json" } }),
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Blocked generated tracker data read");
  });
});
