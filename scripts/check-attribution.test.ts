import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { checkCommitMessage, checkPullRequest, trailerBlock } from "./check-attribution.js";

const claudeCommit = {
  message: "feat: x\n\nCo-Authored-By: Claude Code <noreply@anthropic.com>",
};
const goodBody = "Closes #1\n\nAgent: claude-code\n";

describe("checkCommitMessage", () => {
  it("accepts the canonical trailers", () => {
    expect(checkCommitMessage(claudeCommit.message)).toEqual({ agent: true, problems: [] });
    expect(checkCommitMessage("x\n\nCo-Authored-By: Codex <codex@openai.com>").problems).toEqual(
      [],
    );
  });

  it("rejects model-versioned names", () => {
    const { agent, problems } = checkCommitMessage(
      "x\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
    );
    expect(agent).toBe(false);
    expect(problems).toHaveLength(1);
  });

  it("ignores humans & unlisted agents", () => {
    expect(
      checkCommitMessage(
        "x\n\nCo-authored-by: Ada <ada@example.com>\nCo-Authored-By: Copilot <c@github.com>",
      ),
    ).toEqual({ agent: false, problems: [] });
  });
});

describe("trailer block parsing", () => {
  it("ignores a quoted non-canonical trailer followed by prose", () => {
    const message =
      "docs: explain attribution migration\n\nThe old form was:\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n\nWe now use the stable name.";
    expect(checkCommitMessage(message)).toEqual({ agent: false, problems: [] });
  });

  it("does not treat a quoted canonical trailer in prose as agent authorship", () => {
    const message =
      "docs: attribution\n\nCo-Authored-By: Codex <codex@openai.com>\n\nThat is the Codex form.";
    expect(checkCommitMessage(message).agent).toBe(false);
    expect(checkPullRequest({ body: "Docs only.", commits: [{ message }], labels: [] })).toEqual(
      [],
    );
  });

  it("still validates a real trailer block after quoted prose", () => {
    const message =
      "x\n\nSee Co-Authored-By: Foo <a@b.c>.\n\nSigned-off-by: A <a@b.c>\nCo-Authored-By: Claude Opus <noreply@anthropic.com>";
    expect(checkCommitMessage(message).problems).toHaveLength(1);
  });

  it("needs a subject paragraph before the trailer block", () => {
    expect(trailerBlock("Co-Authored-By: Codex <codex@openai.com>")).toBe("");
  });

  it("accepts continuation lines & trailing blank lines", () => {
    expect(trailerBlock("x\n\nA: b\n  c\nCo-Authored-By: Codex <codex@openai.com>\n\n")).not.toBe(
      "",
    );
  });
});

describe("commit count cap", () => {
  it("fails when the listing is shorter than the PR's commits, or the cap is exceeded", () => {
    const commits = [{ message: "x" }];
    expect(checkPullRequest({ body: "", commitCount: 1, commits, labels: [] })).toEqual([]);
    expect(checkPullRequest({ body: "", commitCount: 2, commits, labels: [] })).toHaveLength(1);
    expect(
      checkPullRequest({
        body: "",
        commitCount: 251,
        commits: Array.from({ length: 251 }, () => ({ message: "x" })),
        labels: [],
      }),
    ).toHaveLength(1);
  });
});

describe("checkPullRequest", () => {
  it("passes a human-only PR with no trailer, line, or label", () => {
    expect(
      checkPullRequest({
        body: "Fixes typo.",
        commits: [{ message: "fix: typo" }],
        labels: ["bug"],
      }),
    ).toEqual([]);
  });

  it("passes a well-formed agent PR", () => {
    expect(
      checkPullRequest({ body: goodBody, commits: [claudeCommit], labels: ["agent: claude"] }),
    ).toEqual([]);
  });

  it("requires the Agent line & one label once a trailer marks the PR as agent-authored", () => {
    const problems = checkPullRequest({ body: "Closes #1", commits: [claudeCommit], labels: [] });
    expect(problems).toHaveLength(2);
  });

  it("requires the Agent line to be last", () => {
    expect(
      checkPullRequest({
        body: "Agent: claude-code\n\nMore.",
        commits: [],
        labels: ["agent: claude"],
      }),
    ).toHaveLength(1);
  });

  it("rejects two agent labels or a mismatched one", () => {
    expect(
      checkPullRequest({ body: goodBody, commits: [], labels: ["agent: claude", "agent: codex"] }),
    ).toHaveLength(1);
    expect(
      checkPullRequest({ body: goodBody, commits: [], labels: ["agent: codex"] }),
    ).toHaveLength(1);
  });

  it("rejects the harness footer", () => {
    expect(
      checkPullRequest({
        body: "Closes #1\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)",
        commits: [],
        labels: [],
      }),
    ).toHaveLength(1);
  });

  it("allows prose that merely mentions the footer", () => {
    expect(
      checkPullRequest({
        body: 'Rejects the "Generated with Claude Code" footer.\n\nAgent: claude-code',
        commits: [],
        labels: ["agent: claude"],
      }),
    ).toEqual([]);
  });

  it("skips merge commits", () => {
    expect(
      checkPullRequest({
        body: "",
        commits: [
          { message: "Merge\n\nCo-Authored-By: Claude Opus <noreply@anthropic.com>", parents: 2 },
        ],
        labels: [],
      }),
    ).toEqual([]);
  });
});

describe("check-attribution commit-msg mode", () => {
  it("exits 1 for a drifted trailer & 0 for a canonical one", () => {
    const file = join(tmpdir(), `check-attribution-${process.pid}.txt`);
    writeFileSync(file, "x\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\n");
    expect(spawnSync("node", ["scripts/check-attribution.ts", "--commit-msg", file]).status).toBe(
      1,
    );
    writeFileSync(file, `${claudeCommit.message}\n`);
    expect(spawnSync("node", ["scripts/check-attribution.ts", "--commit-msg", file]).status).toBe(
      0,
    );
  });
});
