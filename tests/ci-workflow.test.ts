import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface Workflow {
  jobs?: Record<
    string,
    {
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
  };
  permissions?: Record<string, string>;
}

interface WorkflowStep {
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, boolean | number | string>;
}

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
