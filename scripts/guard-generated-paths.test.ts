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
  it("allows edits of the project-owned ui components", () => {
    expect(
      guardMessage(edit("/work/mistria/src/lib/components/ui/button/button.svelte")),
    ).toBeUndefined();
    expect(guardMessage(edit("src/lib/components/ui/dialog/index.ts"))).toBeUndefined();
    expect(bash("rm -rf src/lib/components/ui/toggle")).toBeUndefined();
    expect(bash("cd src/lib/components/ui && touch button.svelte")).toBeUndefined();
  });

  it("blocks the generated tracker data", () => {
    expect(guardMessage(edit("src/lib/data/tracker-data.json"))).toContain("pnpm run pipeline");
    expect(guardMessage(edit("/work/.worktrees/x/src/lib/data/tracker-data.json"))).toBeDefined();
  });

  it("blocks historical superpowers plans & specs", () => {
    expect(
      guardMessage({
        cwd,
        tool_input: { file_path: "docs/superpowers/plans/example.md" },
        tool_name: "Edit",
      }),
    ).toContain(
      "docs/superpowers/ holds historical plans & specs. Update the current docs/*.md instead.",
    );
    expect(bash("echo x > docs/superpowers/notes.md")).toContain(
      "docs/superpowers/ holds historical plans & specs. Update the current docs/*.md instead.",
    );
  });

  it("allows lookalikes & ordinary files", () => {
    expect(guardMessage(edit("src/lib/components/icon/ui.svelte"))).toBeUndefined();
    expect(guardMessage(edit("src/lib/components/ui-kit/a.svelte"))).toBeUndefined();
    expect(guardMessage(edit("src/lib/data/tracker-data.ts"))).toBeUndefined();
    expect(guardMessage(edit("src/lib/data/tracker-data.json.md"))).toBeUndefined();
    expect(guardMessage(edit("pipeline/src/main.ts"))).toBeUndefined();
    expect(
      guardMessage({
        cwd,
        tool_input: { file_path: "docs/superpowers-notes.md" },
        tool_name: "Edit",
      }),
    ).toBeUndefined();
    expect(
      guardMessage({
        cwd,
        tool_input: { file_path: "docs/styling.md" },
        tool_name: "Edit",
      }),
    ).toBeUndefined();
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
      "tee src/lib/data/tracker-data.json",
      "sed -i 's/a/b/' src/lib/data/tracker-data.json",
      "rm src/lib/data/tracker-data.json",
      "mv src/lib/data/tracker-data.json /tmp/data.json",
    ]) {
      expect(guardMessage({ cwd, tool_input: { command }, tool_name: "Bash" })).toContain(
        "Blocked edit",
      );
    }
    expect(
      guardMessage({
        cwd,
        tool_input: { command: "cat src/lib/types/tracker-data.ts" },
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
      "echo done > /tmp/log.txt; ls src/lib/data",
      "ls src/lib/data && touch /tmp/marker",
      "git log --oneline -- src/lib/data/tracker-data.json | tee /tmp/log.txt",
      "cat src/lib/data/tracker-data.json > /tmp/copy.json",
      "ls src/lib/data 2>&1 >/dev/null",
      "ls src/lib/data &>/tmp/out.txt",
      "grep x <<< src/lib/data/tracker-data.json; touch /tmp/y",
      "jq . src/lib/data/tracker-data.json > /tmp/out.json",
      "rg foo src/lib/data 2>/dev/null | head > /tmp/o",
      "cd src/lib/data && ls 2>/dev/null",
      "cp -t /tmp src/lib/data/tracker-data.json",
      "cp src/lib/data/tracker-data.json /tmp/copy.json",
      "sed -n '1,5p' src/lib/data/tracker-data.json; rm /tmp/x",
      `cd /work/mistria && node -e 'require("node:fs").writeFileSync("/tmp/scratch/oxfmt.json", "{}")' && pnpm exec oxfmt --check -c /tmp/scratch/oxfmt.json src/lib/data/tracker-data.json`,
      "cd /work/mistria && echo x > /tmp/log.txt; ls src/lib/data",
      "cd /work/mistria && rm -f ~/scratch/a.txt; ls src/lib/data",
    ]) {
      expect(bash(command), command).toBeUndefined();
    }
  });

  it("blocks a guarded write anywhere in a compound command", () => {
    for (const command of [
      "ls src/lib/data; echo '{}' > src/lib/data/tracker-data.json",
      "cd /tmp && rm -rf /work/mistria/src/lib/data/tracker-data.json",
      "git status || cp /tmp/x.json src/lib/data/tracker-data.json",
      "echo x | tee -a src/lib/data/tracker-data.json",
      "true\nsed -i 's/a;b/c/' src/lib/data/tracker-data.json",
      "echo {} >>src/lib/data/tracker-data.json && ls",
      "echo {} &> src/lib/data/tracker-data.json",
      String.raw`ls; find /tmp -exec rm {} \; src/lib/data/tracker-data.json`,
      "echo x >& src/lib/data/tracker-data.json",
      "echo x >&src/lib/data/tracker-data.json",
      "cd /work/mistria && touch src/lib/data/tracker-data.json",
      "(cd /work/mistria; rm -f src/lib/data/tracker-data.json)",
      "echo src/lib/data/tracker-data.json | xargs rm",
      "find src/lib/data/tracker-data.json | xargs sed -i s/a/b/",
      'ls src/lib/data/tracker-data.json | while read f; do rm "$f"; done',
      "bash <<'EOF'\necho x > src/lib/data/tracker-data.json\nEOF",
      "sh <<EOF\ncp a src/lib/data/tracker-data.json\nEOF",
      "install -D a.json src/lib/data/tracker-data.json",
      "/bin/bash <<'EOF'\necho x > src/lib/data/tracker-data.json\nEOF",
      "sudo sh <<EOF\ntouch src/lib/data/tracker-data.json\nEOF",
      "env bash <<EOF\nrm src/lib/data/tracker-data.json\nEOF",
      "f=src/lib/data/tracker-data.json; echo x > $f",
      "cp a.json src/lib/data/tracker-data.json -v",
      "cp a src/lib/data/tracker-data.json # copy",
      "echo $((1<<2))\ncp a src/lib/data/tracker-data.json",
      "cat > src/lib/data/tracker-data.json <<'EOF'\n{}\nEOF",
      "python3 - <<'EOF'\nPath('src/lib/data/tracker-data.json').write_text('{}')\nEOF",
      `node -e 'require("node:fs").writeFileSync("src/lib/data/tracker-data.json", "{}")'`,
      `python3 -c "Path('src/lib/data/tracker-data.json').write_text('{}')"`,
      'cd /work/mistria && node -e \'writeFileSync("src/lib/data/tracker-data.json", "")\'',
      "node -e 'writeFileSync(name, \"\")' src/lib/data/tracker-data.json",
      "cd /work/mistria && echo x > /tmp/a; touch src/lib/data/tracker-data.json",
      "bash <<'EOF' | tail\necho x > src/lib/data/tracker-data.json\nEOF",
      "bash <<'EOF' && echo done\nrm src/lib/data/tracker-data.json\nEOF",
      `node -e 'require("fs").writeFileSync("./" + process.argv[1], "x")' src/lib/data/tracker-data.json`,
      "exec 3<>src/lib/data/tracker-data.json; echo x >&3",
      "cat <<'EOF' | sh\nrm src/lib/data/tracker-data.json\nEOF",
      String.raw`cd /work/mistria && touch \src/lib/data/tracker-data.json`,
      "cat > /tmp/out.md <<EOF\n$(rm src/lib/data/tracker-data.json)\nEOF",
    ]) {
      expect(bash(command), command).toContain("Blocked edit");
    }
  });

  it("allows heredoc redirects to an outside file", () => {
    expect(
      bash(
        "cat >> ~/notes/outside.md <<'EOF'\nTouched src/lib/data/tracker-data.json; rm nothing > here.\nEOF\nls src/lib/data; git log --oneline -- src/lib/data/tracker-data.json",
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

  it("exits 2 with an explanation for an edit under docs/superpowers/", () => {
    const result = run({
      cwd,
      tool_input: { file_path: "docs/superpowers/plans/example.md" },
      tool_name: "Edit",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "docs/superpowers/ holds historical plans & specs. Update the current docs/*.md instead.",
    );
  });

  it("exits 0 for any other edit", () => {
    const result = run({ cwd, tool_input: { file_path: "README.md" }, tool_name: "Edit" });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
