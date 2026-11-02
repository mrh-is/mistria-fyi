import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * Once the repo is public, a fork PR can trigger any workflow that listens for pull requests. These
 * rules hold for every file in `.github/workflows/`: no trigger that hands fork-controlled events a
 * write token or secrets, except the narrowly checked trusted visual publisher approved in #332;
 * an explicit workflow-level token ceiling, write scopes only on jobs that
 * never run for pull requests, and actions pinned to full commit SHAs.
 */

interface Workflow {
  jobs?: Record<
    string,
    {
      if?: string;
      permissions?: Record<string, string>;
      steps?: { run?: string; uses?: string; with?: Record<string, unknown> }[];
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
const secretReferences =
  /wrangler|pages deploy|sprites:upload|fonts:upload|CLOUDFLARE_|\bsecrets\b/;
// The one exception (docs/decisions/2026-11-01-gate-production-on-ci.md): this exact line, once, in
// CI. ci-workflow.isolated.test.ts holds its job to main pushes & the `production` environment.
// oxlint-disable-next-line no-template-curly-in-string -- literal GitHub Actions expression text
const productionDeployHook = "DEPLOY_HOOK_URL: ${{ secrets.PRODUCTION_DEPLOY_HOOK }}";

describe("workflow hardening", () => {
  it("finds the workflows", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("limits the approved visual publisher to trusted code & isolated artifacts", () => {
    const publishers = workflows.filter(({ name }) => name === "visual-diff-publish.yml");
    expect(publishers).toHaveLength(1);
    const { workflow } = publishers[0];
    expect(triggers(workflow)).toEqual(["workflow_run"]);
    expect((workflow.on as Record<string, unknown>).workflow_run).toEqual({
      types: ["completed"],
      workflows: ["Visual-diff pilot"],
    });
    expect(Object.keys(workflow.jobs ?? {})).toEqual(["publish"]);
    const publish = workflow.jobs?.publish;
    expect(publish?.if).toBe("github.event.workflow_run.event == 'pull_request'");
    expect(publish?.permissions).toEqual({
      actions: "read",
      contents: "write",
      "pull-requests": "write",
    });
    const steps = publish?.steps ?? [];
    expect(steps.flatMap((step) => step.run ?? [])).toEqual([
      "node scripts/publish-visual-diff.ts",
    ]);
    expect(steps.filter((step) => step.uses?.startsWith("actions/checkout@"))).toHaveLength(1);
    const checkout = steps.find((step) => step.uses?.startsWith("actions/checkout@"));
    expect(checkout?.with).toEqual({
      "persist-credentials": false,
      ref: `\${{ github.event.repository.default_branch }}`,
    });
    expect(
      steps.filter((step) => step.uses?.startsWith("actions/download-artifact@")),
    ).toHaveLength(1);
    const download = steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
    expect(download?.with?.path).toBe(`\${{ runner.temp }}/visual-artifact`);
    expect(steps.map((step) => step.uses).filter(Boolean)).toEqual([
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
      "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
      "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
    ]);
  });

  describe.each(workflows)("$name", ({ name, source, workflow }) => {
    it("avoids triggers that give fork-controlled events a write token or secrets", () => {
      const forbidden = triggers(workflow)
        .filter((trigger) => unsafeTriggers.has(trigger))
        .filter((trigger) => name !== "visual-diff-publish.yml" || trigger !== "workflow_run");
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
      const unpinned = source
        .split("\n")
        .filter((line) => /^\s*-?\s*uses:/.test(line))
        .filter((line) => !/@[a-f0-9]{40} # v\d+(\.\d+)*$/.test(line));
      expect(unpinned).toEqual([]);
    });

    it("references no deploy credentials or repository secrets", () => {
      // A whole-line comment can't read a secret, & “no secrets” is a fair thing for one to say.
      const code = source.replaceAll(/^\s*#.*$/gm, "");
      const checked = name === "ci.yml" ? code.replace(productionDeployHook, "") : code;
      expect(checked).not.toMatch(secretReferences);
    });
  });
});
