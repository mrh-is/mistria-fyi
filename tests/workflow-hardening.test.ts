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
    {
      if?: string;
      permissions?: Record<string, string>;
      steps?: { uses?: string; with?: { "persist-credentials"?: boolean } }[];
    }
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

const unsafeTriggers = new Set([
  "issue_comment",
  "pull_request_review",
  "pull_request_review_comment",
  "pull_request_target",
  "workflow_run",
]);
const secretReferences = /wrangler|pages deploy|sprites:upload|fonts:upload|CLOUDFLARE_|secrets\./;
/**
 * The one exception: ci.yml's "Real saves" job reads private test saves with a read-only R2 token
 * (#466). Pull requests from forks get no secrets, & the token can't write. Only these exact lines
 * are exempt; any other reference in ci.yml still fails.
 */
const secretExpression = (secret: string): string => ["$", "{{ secrets.", secret, " }}"].join("");
const ALLOWED_CI_SECRET_LINES = new Set(
  ["CLOUDFLARE_ACCOUNT_ID", "R2_SAVES_READ_TOKEN"].map(
    (secret) => `${secret}: ${secretExpression(secret)}`,
  ),
);

describe("workflow hardening", () => {
  it("finds the workflows", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe.each(workflows)("$name", ({ name, source, workflow }) => {
    it("avoids triggers that give fork-controlled events a write token or secrets", () => {
      const forbidden = triggers(workflow).filter((trigger) => unsafeTriggers.has(trigger));
      expect(forbidden).toEqual([]);
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
      const unpinnedSteps = Object.values(workflow.jobs ?? {})
        .flatMap((job) => job.steps ?? [])
        .map((step) => step.uses)
        .filter((uses) => uses !== undefined && !/^[^@]+@[a-f0-9]{40}$/u.test(uses));
      expect(unpinnedSteps).toEqual([]);

      const missingPinOrComment = source
        .split("\n")
        .filter((line) => /^\s*-?\s*uses:/.test(line))
        .filter((line) => !/@[a-f0-9]{40} # v\d+(\.\d+)*$/.test(line));
      expect(missingPinOrComment).toEqual([]);
    });

    it("references no deploy credentials or repository secrets", () => {
      const checked =
        name === "ci.yml"
          ? source
              .split("\n")
              .filter((line) => !ALLOWED_CI_SECRET_LINES.has(line.trim()))
              .join("\n")
          : source;
      expect(checked).not.toMatch(secretReferences);
    });
  });

  it("exposes the saves secrets only to the saves job’s fetch step", () => {
    const ci = workflows.find(({ name }) => name === "ci.yml")?.workflow;
    const jobs = (ci?.jobs ?? {}) as Record<string, { steps?: { env?: object; name?: string }[] }>;
    const others = Object.entries(jobs).filter(([jobName]) => jobName !== "saves");
    expect(others.filter(([, job]) => JSON.stringify(job).includes("secrets."))).toEqual([]);
    const withSecrets = (jobs.saves.steps ?? []).filter((step) =>
      JSON.stringify(step).includes("secrets."),
    );
    expect(withSecrets.map((step) => step.name)).toEqual(["Fetch real saves"]);
    expect(Object.keys(withSecrets[0]?.env ?? {}).toSorted()).toEqual([
      "CLOUDFLARE_ACCOUNT_ID",
      "R2_SAVES_READ_TOKEN",
    ]);
  });

  it("limits CI to the permissions its jobs need & keeps checkout credentials out of git config", () => {
    const ci = workflows.find(({ name }) => name === "ci.yml")?.workflow;
    const elevated: Record<string, Record<string, string>> = {
      changes: { contents: "read", "pull-requests": "read" },
      "ci-passed": { actions: "read", contents: "read" },
      "nightly-report": { actions: "read", contents: "read", issues: "write" },
    };
    expect(ci?.permissions).toEqual({ contents: "read" });
    for (const [jobName, job] of Object.entries(ci?.jobs ?? {})) {
      expect(job.permissions, jobName).toEqual(elevated[jobName]);
      const checkoutSteps = job.steps?.filter((step) => step.uses?.startsWith("actions/checkout@"));
      for (const step of checkoutSteps ?? []) {
        expect(step.with?.["persist-credentials"], jobName).toBe(false);
      }
    }
  });

  it("reads Guarded paths approvals from the live PR", () => {
    const source = workflows.find(({ name }) => name === "guarded-paths.yml")?.source;
    expect(source).toContain('gh api "repos/$REPOSITORY/pulls/$PR_NUMBER"');
    expect(source).not.toContain("github.event.pull_request.labels");
    expect(source).not.toContain("github.event.pull_request.body");
  });
});
