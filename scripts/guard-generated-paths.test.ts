import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { guardMessage } from "./guard-generated-paths.js";

const cwd = "/work/mistria";

function edit(file_path: string) {
  return { cwd, tool_input: { file_path } };
}

function bash(command: string) {
  return guardMessage({ cwd, tool_input: { command }, tool_name: "Bash" });
}

describe("guardMessage", () => {
  it("blocks vendored shadcn files, absolute or relative", () => {
    expect(
      guardMessage(edit("/work/mistria/src/lib/components/ui/button/button.svelte")),
    ).toContain("shadcn-svelte");
    expect(guardMessage(edit("src/lib/components/ui/dialog/index.ts"))).toContain("shadcn-svelte");
    expect(guardMessage(edit("src/lib/components/ui/../ui/card.svelte"))).toBeDefined();
  });

  it("blocks the generated tracker data", () => {
    expect(guardMessage(edit("src/lib/data/tracker-data.json"))).toContain("pnpm run pipeline");
    expect(guardMessage(edit("/work/.worktrees/x/src/lib/data/tracker-data.json"))).toBeDefined();
  });

  it("allows lookalikes & ordinary files", () => {
    expect(guardMessage(edit("src/lib/components/icon/ui.svelte"))).toBeUndefined();
    expect(guardMessage(edit("src/lib/components/ui-kit/a.svelte"))).toBeUndefined();
    expect(guardMessage(edit("src/lib/data/tracker-data.ts"))).toBeUndefined();
    expect(guardMessage(edit("src/lib/data/tracker-data.json.md"))).toBeUndefined();
    expect(guardMessage(edit("pipeline/src/main.ts"))).toBeUndefined();
    expect(guardMessage({ cwd, tool_input: {} })).toBeUndefined();
  });

  it("checks every patch target, including move destinations & deletions", () => {
    for (const header of ["Add File", "Update File", "Delete File", "Move to"]) {
      expect(
        guardMessage({
          cwd,
          tool_input: {
            command: `*** Begin Patch\n*** Update File: README.md\n*** ${header}: src/lib/data/tracker-data.json\n*** End Patch`,
          },
          tool_name: "apply_patch",
        }),
      ).toContain("Blocked edit");
    }
    expect(
      guardMessage({
        cwd,
        tool_input:
          "*** Begin Patch\n*** Update File: README.md\n+src/lib/data/tracker-data.json\n*** End Patch",
        tool_name: "apply_patch",
      }),
    ).toBeUndefined();
  });

  it("denies direct shell writes without denying reads or pipeline execution", () => {
    for (const command of [
      'echo "{}" > src/lib/data/tracker-data.json',
      "tee src/lib/components/ui/button.ts",
      "sed -i 's/a/b/' src/lib/data/tracker-data.json",
      "rm src/lib/data/tracker-data.json",
      "rm -rf src/lib/components/ui",
      "mv src/lib/components/ui /tmp/ui",
    ]) {
      expect(guardMessage({ cwd, tool_input: { command }, tool_name: "Bash" })).toContain(
        "Blocked edit",
      );
    }
    expect(
      guardMessage({
        cwd,
        tool_input: { command: "cat src/lib/components/ui/button.ts" },
        tool_name: "Bash",
      }),
    ).toBeUndefined();
    expect(
      guardMessage({
        cwd,
        tool_input: { command: "pnpm run pipeline -- pipeline/input" },
        tool_name: "Bash",
      }),
    ).toBeUndefined();
  });

  it("ignores guarded reads in a compound command with an unrelated write", () => {
    for (const command of [
      "echo done > /tmp/log.txt; ls src/lib/components/ui",
      "ls src/lib/components/ui && touch /tmp/marker",
      "git log --oneline -- src/lib/data/tracker-data.json | tee /tmp/log.txt",
      "cat src/lib/data/tracker-data.json > /tmp/copy.json",
      "ls src/lib/components/ui 2>&1 >/dev/null",
      "ls src/lib/components/ui &>/tmp/out.txt",
      "grep x <<< src/lib/data/tracker-data.json; touch /tmp/y",
      "jq . src/lib/data/tracker-data.json > /tmp/out.json",
      "rg foo src/lib/components/ui 2>/dev/null | head > /tmp/o",
      "cd src/lib/components/ui && ls 2>/dev/null",
      "cp -t /tmp src/lib/data/tracker-data.json",
      "cp src/lib/data/tracker-data.json /tmp/copy.json",
      "sed -n '1,5p' src/lib/data/tracker-data.json; rm /tmp/x",
      `cd /work/mistria && node -e 'require("node:fs").writeFileSync("/tmp/scratch/oxfmt.json", "{}")' && pnpm exec oxfmt --check -c /tmp/scratch/oxfmt.json src/lib/data/tracker-data.json`,
      "cd /work/mistria && echo x > /tmp/log.txt; ls src/lib/components/ui",
      "cd /work/mistria && rm -f ~/scratch/a.txt; ls src/lib/components/ui",
    ]) {
      expect(bash(command), command).toBeUndefined();
    }
  });

  it("blocks a guarded write anywhere in a compound command", () => {
    for (const command of [
      "ls src/lib/components/ui; echo '{}' > src/lib/data/tracker-data.json",
      "cd /tmp && rm -rf /work/mistria/src/lib/components/ui",
      "git status || cp /tmp/x.json src/lib/data/tracker-data.json",
      "echo x | tee -a src/lib/components/ui/button.ts",
      "true\nsed -i 's/a;b/c/' src/lib/data/tracker-data.json",
      "echo {} >>src/lib/data/tracker-data.json && ls",
      "echo {} &> src/lib/data/tracker-data.json",
      String.raw`ls; find /tmp -exec rm {} \; src/lib/components/ui/a.ts`,
      "echo x >& src/lib/data/tracker-data.json",
      "echo x >&src/lib/data/tracker-data.json",
      "cd src/lib/components/ui && touch button.svelte",
      "(cd src/lib/components/ui; rm -f x.svelte)",
      "echo src/lib/data/tracker-data.json | xargs rm",
      "find src/lib/components/ui -name '*.svelte' | xargs sed -i s/a/b/",
      'ls src/lib/components/ui | while read f; do rm "$f"; done',
      "bash <<'EOF'\necho x > src/lib/data/tracker-data.json\nEOF",
      "sh <<EOF\ncp a src/lib/data/tracker-data.json\nEOF",
      "cp -t src/lib/components/ui a.svelte",
      "cp -rt src/lib/components/ui a.svelte",
      "install -Dt src/lib/components/ui a.svelte",
      "/bin/bash <<'EOF'\necho x > src/lib/data/tracker-data.json\nEOF",
      "sudo sh <<EOF\ntouch src/lib/data/tracker-data.json\nEOF",
      "env bash <<EOF\nrm src/lib/data/tracker-data.json\nEOF",
      "f=src/lib/data/tracker-data.json; echo x > $f",
      "cp a.svelte src/lib/components/ui/ -v",
      "cp a src/lib/components/ui/b.svelte # copy",
      "echo $((1<<2))\ncp a src/lib/data/tracker-data.json",
      "cat > src/lib/components/ui/a.ts <<'EOF'\nexport {};\nEOF",
      "python3 - <<'EOF'\nPath('src/lib/data/tracker-data.json').write_text('{}')\nEOF",
      `node -e 'require("node:fs").writeFileSync("src/lib/data/tracker-data.json", "{}")'`,
      `python3 -c "Path('src/lib/data/tracker-data.json').write_text('{}')"`,
      'cd src/lib/components/ui && node -e \'writeFileSync("a.svelte", "")\'',
      "cd src/lib/components/ui && node -e 'writeFileSync(name, \"\")'",
      "cd src/lib/components/ui && echo x > /tmp/a; touch b.svelte",
      "bash <<'EOF' | tail\necho x > src/lib/data/tracker-data.json\nEOF",
      "bash <<'EOF' && echo done\nrm src/lib/data/tracker-data.json\nEOF",
      `node -e 'require("fs").writeFileSync("./" + process.argv[1], "x")' src/lib/data/tracker-data.json`,
      "exec 3<>src/lib/data/tracker-data.json; echo x >&3",
      "cat <<'EOF' | sh\nrm src/lib/data/tracker-data.json\nEOF",
      String.raw`cd src/lib/components/ui && touch \a.svelte`,
      "cat > /tmp/out.md <<EOF\n$(rm src/lib/data/tracker-data.json)\nEOF",
    ]) {
      expect(bash(command), command).toContain("Blocked edit");
    }
  });

  it("allows heredoc redirects to an outside file", () => {
    expect(
      bash(
        "cat >> ~/notes/outside.md <<'EOF'\nTouched src/lib/components/ui; rm nothing > here.\nEOF\nls src/lib/components/ui; git log --oneline -- src/lib/components/ui",
      ),
    ).toBeUndefined();
    expect(
      bash("cat <<-EOF > /tmp/out.md\n\tsrc/lib/data/tracker-data.json\n\tEOF\nls src/lib/data"),
    ).toBeUndefined();
    // Prose that only mentions an API, fed to a program that isn't an interpreter.
    expect(
      bash(
        "gh pr review 1 --body-file - <<'EOF' | tail -1\nwriteFileSync(\"src/lib/data/tracker-data.json\")\nEOF",
      ),
    ).toBeUndefined();
  });
});

function run(input: unknown) {
  return spawnSync("node", ["scripts/guard-generated-paths.ts"], {
    encoding: "utf8",
    input: JSON.stringify(input),
  });
}

describe("guard-generated-paths hook", () => {
  it("exits 2 with an explanation for a guarded Write", () => {
    const result = run({
      cwd,
      tool_input: { content: "{}", file_path: "src/lib/data/tracker-data.json" },
      tool_name: "Write",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Blocked edit");
  });

  it("exits 0 for any other edit", () => {
    const result = run({ cwd, tool_input: { file_path: "README.md" }, tool_name: "Edit" });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
