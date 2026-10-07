import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * Once the repo is public, a fork PR can trigger any workflow that listens for pull requests. These
 * rules hold for every file in `.github/workflows/`: no trigger that hands fork-controlled events a
 * write token or secrets, an explicit workflow-level token ceiling, write scopes only on jobs that
 * never run for pull requests, and actions pinned to full commit SHAs.
 */

interface Workflow {
  jobs?: Record<
    string,
    { if?: string; permissions?: Record<string, string>; steps?: { uses?: string }[] }
  >;
  on?: Record<string, unknown> | string | string[];
  permissions?: Record<string, string>;
}

const dir = ".github/workflows";
const files = readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));
const workflows = files.map((name) => {
  const source = readFileSync(`${dir}/${name}`, "utf8");
  return { name, source, workflow: parse(source) as Workflow };
});

function triggers(workflow: Workflow): string[] {
  const { on } = workflow;
  if (typeof on === "string") {
    return [on];
  }
  return Array.isArray(on) ? on : Object.keys(on ?? {});
}

const unsafeTriggers = [
  "issue_comment",
  "pull_request_review",
  "pull_request_review_comment",
  "pull_request_target",
  "workflow_run",
];
const secretReferences = /wrangler|pages deploy|sprites:upload|fonts:upload|CLOUDFLARE_|secrets\./;

describe("workflow hardening", () => {
  it("finds the workflows", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe.each(workflows)("$name", ({ source, workflow }) => {
    it("avoids triggers that give fork-controlled events a write token or secrets", () => {
      for (const trigger of triggers(workflow)) {
        expect(unsafeTriggers).not.toContain(trigger);
      }
    });

    it("declares a workflow-level permissions ceiling without write scopes", () => {
      expect(workflow.permissions).toBeDefined();
      expect(Object.values(workflow.permissions ?? {})).not.toContain("write");
    });

    it("limits write scopes in pull request workflows to scheduled-only jobs", () => {
      const onPullRequest = triggers(workflow).includes("pull_request");
      const unguarded = Object.entries(workflow.jobs ?? {})
        .filter(([, job]) => Object.values(job.permissions ?? {}).includes("write"))
        .filter(([, job]) => !(job.if ?? "").includes("github.event_name == 'schedule'"))
        .map(([jobName]) => jobName);
      expect(onPullRequest ? unguarded : []).toEqual([]);
    });

    it("pins every action to a full commit SHA with a version comment", () => {
      const unpinned = source
        .split("\n")
        .filter((line) => /^\s*-?\s*uses:/.test(line))
        .filter((line) => !/@[a-f0-9]{40} # v\d+(\.\d+)*$/.test(line));
      expect(unpinned).toEqual([]);
    });

    it("references no deploy credentials or repository secrets", () => {
      expect(source).not.toMatch(secretReferences);
    });
  });
});
