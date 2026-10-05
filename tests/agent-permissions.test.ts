import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The Claude Code allowlist and the Codex rules both gate which pnpm scripts agents run without a
 * prompt. They drift when a script is added, so this test ties them to `package.json`: every script
 * is allowed in both or listed in NOT_ALLOWED with a reason.
 */

const NOT_ALLOWED: Record<string, string> = {
  "accessibility:monitor": "files GitHub issues from CI evidence",
  "check:watch": "never exits",
  "cloudflare:logs": "reads production logs with stored Cloudflare credentials",
  "fonts:build": "regenerates committed font subsets",
  "fonts:install": "installs a separate dependency tree",
  "fonts:upload": "publishes to production storage",
  "generate:brand-assets": "rewrites committed brand assets",
  "optimize-icons": "rewrites committed icon files",
  "sprites:upload": "publishes to production storage",
  "sprites:villagers": "rewrites generated sprites from game assets",
  "worktree:cleanup:apply": "deletes worktrees & branches",
};

/** Tools the docs prescribe through `pnpm exec`. */
const REQUIRED_EXEC = [
  "eslint",
  "oxfmt",
  "oxlint",
  "playwright",
  "stylelint",
  "svelte-check",
  "svelte-kit",
  "tsx",
  "vitest",
];

const scripts = Object.keys(
  (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts,
);

function claudeAllowed(kind: "exec" | "run"): string[] {
  const { permissions } = JSON.parse(readFileSync(".claude/settings.json", "utf8")) as {
    permissions: { allow: string[] };
  };
  return permissions.allow.flatMap((entry) => {
    const match = new RegExp(`^Bash\\(pnpm ${kind} (\\S+) \\*\\)$`).exec(entry);
    return match ? [match[1]] : [];
  });
}

function codexAllowed(kind: "exec" | "run"): string[] {
  const rules = readFileSync(".codex/rules/default.rules", "utf8");
  const match = new RegExp(`"pnpm",\\s*"${kind}",\\s*\\[([^\\]]*)\\]`).exec(rules);
  return [...(match?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((quoted) => quoted[1]);
}

const sources = { claude: claudeAllowed, codex: codexAllowed };

describe.each(Object.entries(sources))("%s permission allowlist", (_name, allowed) => {
  it("allows every package.json script unless NOT_ALLOWED says why not", () => {
    const missing = scripts.filter(
      (script) => !allowed("run").includes(script) && !(script in NOT_ALLOWED),
    );
    expect(missing).toEqual([]);
  });

  it("names no script that package.json lacks, or that NOT_ALLOWED excludes", () => {
    const stale = allowed("run").filter((script) => !scripts.includes(script));
    const excluded = allowed("run").filter((script) => script in NOT_ALLOWED);
    expect({ excluded, stale }).toEqual({ excluded: [], stale: [] });
  });

  it("allows the documented pnpm exec tools", () => {
    expect(REQUIRED_EXEC.filter((tool) => !allowed("exec").includes(tool))).toEqual([]);
  });
});

describe("NOT_ALLOWED", () => {
  it("lists only scripts that exist", () => {
    expect(Object.keys(NOT_ALLOWED).filter((script) => !scripts.includes(script))).toEqual([]);
  });
});

describe("the two allowlists", () => {
  it("agree on scripts & exec tools", () => {
    expect(codexAllowed("run").toSorted()).toEqual(claudeAllowed("run").toSorted());
    expect(codexAllowed("exec").toSorted()).toEqual(claudeAllowed("exec").toSorted());
  });
});

describe("Claude Code path guard", () => {
  it("registers the PreToolUse hook for every file-writing tool", () => {
    const { hooks } = JSON.parse(readFileSync(".claude/settings.json", "utf8")) as {
      hooks: { PreToolUse?: { hooks: { command: string }[]; matcher: string }[] };
    };
    const guard = hooks.PreToolUse?.find((entry) =>
      entry.hooks.some((hook) => hook.command.includes("guard-generated-paths.ts")),
    );
    expect(guard?.matcher.split("|").toSorted()).toEqual([
      "Edit",
      "MultiEdit",
      "NotebookEdit",
      "Write",
    ]);
  });
});
