import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface Workflow {
  jobs?: Record<
    string,
    {
      continueOnError?: boolean;
      id?: string;
      if?: string;
      needs?: string;
      permissions?: Record<string, string>;
      "runs-on"?: string;
      steps?: WorkflowStep[];
    }
  >;
  on?: {
    pull_request?: unknown;
    push?: {
      branches?: string[];
    };
    schedule?: { cron: string }[];
    workflow_dispatch?: unknown;
  };
  permissions?: Record<string, string>;
}

interface WorkflowStep {
  "continue-on-error"?: boolean;
  id?: string;
  if?: string;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, boolean | number | string>;
}

const pinnedAction = /^[^@]+@[a-f0-9]{40}$/;

describe("CI workflow", () => {
  it("runs the portable verification matrix for pull requests and main pushes", () => {
    const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as Workflow;
    const jobs = Object.values(workflow.jobs ?? {});
    const steps = jobs[0]?.steps ?? [];
    const commands = steps.flatMap((step) => (step.run === undefined ? [] : [step.run]));

    expect(workflow.on).toEqual({
      pull_request: null,
      push: { branches: ["main"] },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.["runs-on"]).toBe("ubuntu-latest");
    expect(commands).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm exec svelte-kit sync",
      "pnpm run lint",
      "pnpm run check",
      "pnpm run test",
      "pnpm run build",
    ]);
  });

  it("uses pinned tooling without credentials or asset-dependent commands", () => {
    const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as Workflow;
    const jobs = Object.values(workflow.jobs ?? {});
    const steps = jobs[0]?.steps ?? [];
    const commands = steps.flatMap((step) => (step.run === undefined ? [] : [step.run]));

    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(jobs[0]?.permissions).toBeUndefined();
    expect(steps.filter((step) => step.uses !== undefined)).toEqual([
      {
        name: "Check out repository",
        uses: "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
        with: {
          "persist-credentials": false,
        },
      },
      {
        name: "Set up pnpm and Node.js",
        uses: "pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2",
        with: {
          cache: true,
          install: false,
          runtime: "node@26",
          version: "11.21.0",
        },
      },
    ]);
    expect(commands.join("\n")).not.toMatch(/lint:fix|pipeline --|test:pipeline:assets/);
  });
});

describe("accessibility workflow", () => {
  const workflow = parse(readFileSync(".github/workflows/accessibility.yml", "utf8")) as Workflow;

  it("runs independently for pull requests, nightly, and manual dispatch", () => {
    expect(workflow.on?.pull_request).toBeNull();
    expect(workflow.on?.workflow_dispatch).toBeNull();
    expect(workflow.on?.schedule).toEqual([{ cron: "17 3 * * *" }]);
    expect(workflow.on).not.toHaveProperty("pull_request_target");
    expect(Object.keys(workflow.jobs ?? {})).toEqual(["accessibility", "issue-sync"]);
  });

  it("pins actions, uses Node 26, and installs only Chromium", () => {
    const steps = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
    for (const step of steps.filter((entry) => entry.uses)) {
      expect(step.uses).toMatch(pinnedAction);
    }
    expect(
      steps
        .filter((step) => step.run)
        .map((step) => step.run)
        .join("\n"),
    ).toContain("playwright install --with-deps chromium");
    expect(
      steps
        .filter((step) => step.run)
        .map((step) => step.run)
        .join("\n"),
    ).not.toMatch(/firefox|webkit/);
    expect(steps.filter((step) => step.uses?.startsWith("pnpm/setup@"))).toSatisfy(
      (setupSteps: WorkflowStep[]) => setupSteps.every((step) => step.with?.runtime === "node@26"),
    );
  });

  it("keeps pull-request tests read-only and scopes issue writes to scheduled synchronization", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.jobs?.accessibility.permissions).toBeUndefined();
    expect(workflow.jobs?.["issue-sync"]?.permissions).toEqual({
      contents: "read",
      issues: "write",
    });
    expect(workflow.jobs?.["issue-sync"]?.if).toContain("github.event_name == 'schedule'");
  });

  it("publishes failure evidence before preserving the failed outcome", () => {
    const steps = workflow.jobs?.accessibility.steps ?? [];
    expect(steps.find((step) => step.id === "accessibility-tests")?.["continue-on-error"]).toBe(
      true,
    );
    const upload = steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
    expect(upload?.if).toContain("failure");
    expect(upload?.with?.path).toContain(".playwright-artifacts/");
    expect(upload?.with?.path).toContain(".playwright-results/");
  });
});
