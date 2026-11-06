import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The Claude Code allowlist and the Codex rules both gate which pnpm scripts agents run without a
 * prompt. They drift when a script is added, so this test ties them to `package.json`: every script
 * is allowed in both or listed in NOT_ALLOWED with a reason.
 */

const NOT_ALLOWED: Record<string, string> = {
  "check:watch": "never exits",
  "cloudflare:logs": "reads production logs with stored Cloudflare credentials",
  "fonts:build": "regenerates committed font subsets",
  "fonts:install": "installs a separate dependency tree",
  "fonts:upload": "publishes to production storage",
  "game-assets:share": "copies licensed game files & saves to the maintainer’s Google Drive",
  "generate:brand-assets": "rewrites committed brand assets",
  "housekeeping:install": "installs a persistent launchd agent that deletes merged worktrees",
  "optimize-icons": "rewrites committed icon files",
  "r2:check": "writes & deletes a probe object in production storage",
  "sprites:upload": "publishes to production storage",
  "sprites:villagers": "rewrites generated sprites from game assets",
  "worktree:cleanup": "a trailing `-- --apply` reaches the same deletion as worktree:cleanup:apply",
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

describe("package-manager deny lists", () => {
  it("denies every alternative package manager in both clients", () => {
    const { permissions } = JSON.parse(readFileSync(".claude/settings.json", "utf8")) as {
      permissions: { deny: string[] };
    };
    const claudeDenied = permissions.deny.flatMap((entry) => {
      const match = /^Bash\((\S+) \*\)$/.exec(entry);
      return match ? [match[1]] : [];
    });
    const rules = readFileSync(".codex/rules/default.rules", "utf8");
    const forbidden = /pattern\s*=\s*\[\[([^\]]*)\]\],\s*decision\s*=\s*"forbidden"/.exec(rules);
    const codexDenied = [...(forbidden?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
      (quoted) => quoted[1],
    );
    const required = ["bun", "npm", "npx", "pnpx", "yarn"];

    expect(claudeDenied.toSorted()).toEqual(required);
    expect(codexDenied.toSorted()).toEqual(required);
  });
});

describe("Claude Code file deny rules", () => {
  // Claude Code applies Read deny rules to Grep & Glob, and Edit deny rules to every file-editing
  // tool. Shell commands aren't covered unless the sandbox is enabled; Codex has no equivalent rule.
  it("denies the R2 token and tracker-data reads & edits", () => {
    const { permissions } = JSON.parse(readFileSync(".claude/settings.json", "utf8")) as {
      permissions: { deny: string[] };
    };
    expect(permissions.deny).toEqual(
      expect.arrayContaining([
        "Read(**/.env.r2-upload)",
        "Read(**/src/lib/data/tracker-data.json)",
        "Edit(**/src/lib/data/tracker-data.json)",
      ]),
    );
  });
});

describe.each([".claude/settings.json", ".codex/hooks.json"])("%s hook parity", (file) => {
  const { hooks } = JSON.parse(readFileSync(file, "utf8")) as {
    hooks: Partial<
      Record<string, { hooks: { command: string; onFailure?: string }[]; matcher?: string }[]>
    >;
  };
  const find = (event: string, script: string) =>
    hooks[event]?.find((entry) => entry.hooks.some((hook) => hook.command.includes(script)));
  const formatter = "agent-tool-hook.ts";

  it("formats file-tool edits & patches, but not shell commands", () => {
    const matcher = new RegExp(`^(?:${find("PostToolUse", formatter)?.matcher ?? ""})$`);
    for (const tool of ["apply_patch", "Edit", "Write", "MultiEdit", "NotebookEdit"]) {
      expect(matcher.test(tool), `PostToolUse: ${tool}`).toBe(true);
    }
    expect(matcher.test("Bash")).toBe(false);
  });

  it("registers only edit formatting & the cloud runtime, and never worktree setup", () => {
    expect(Object.keys(hooks).toSorted()).toEqual(
      file.startsWith(".claude") ? ["PostToolUse", "SessionStart"] : ["PostToolUse"],
    );
    expect(JSON.stringify(hooks)).not.toContain("setup-worktree");
  });

  it("registers no blocking hooks: upkeep failures never stop a tool call", () => {
    const all = Object.values(hooks)
      .flatMap((entries) => entries ?? [])
      .flatMap((entry) => entry.hooks);
    expect(all.length).toBeGreaterThan(0);
    for (const hook of all) expect(hook.onFailure).toBeUndefined();
  });

  it("has exactly one formatting handler", () => {
    const handlers = (hooks.PostToolUse ?? [])
      .flatMap((entry) => entry.hooks)
      .filter((hook) => /(?:format-agent-edit|agent-tool-hook)\.ts/.test(hook.command));
    expect(handlers).toHaveLength(1);
    expect(handlers[0].command).toContain(formatter);
  });
});
