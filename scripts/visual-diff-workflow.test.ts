import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface Workflow {
  jobs: Record<
    string,
    {
      needs?: string[];
      permissions?: Record<string, string>;
      steps: { run?: string; uses?: string; with?: Record<string, unknown> }[];
    }
  >;
  on: Record<string, unknown>;
  permissions: Record<string, string>;
}

function workflow(name: string): Workflow {
  return parse(readFileSync(`.github/workflows/${name}.yml`, "utf8")) as Workflow;
}

describe("visual workflow boundaries", () => {
  it("keeps the pilot out of the required aggregate & runs PR code without write permissions", () => {
    const capture = workflow("visual-diff");
    expect(capture.on).toHaveProperty("pull_request");
    expect(capture.permissions).toEqual({ contents: "read" });
    expect(Object.keys(capture.jobs)).toEqual(["capture"]);
    expect(capture.jobs.capture.permissions).toBeUndefined();
    const required = workflow("ci").jobs["ci-passed"].needs;
    expect(required).toContain("accessibility");
    expect(required).toContain("pwa");
    expect(required).not.toContain("capture");
    expect(
      capture.jobs.capture.steps.filter((step) => step.uses?.startsWith("actions/checkout@")),
    ).toHaveLength(2);
    for (const checkout of capture.jobs.capture.steps.filter((step) =>
      step.uses?.startsWith("actions/checkout@"),
    )) {
      expect(checkout.with?.["persist-credentials"]).toBe(false);
    }
  });

  it("publishes with trusted default-branch code & extracts artifacts outside the checkout", () => {
    const publish = workflow("visual-diff-publish");
    expect(publish.on.workflow_run).toEqual({
      types: ["completed"],
      workflows: ["Visual-diff pilot"],
    });
    expect(publish.on).not.toHaveProperty("pull_request_target");
    const steps = publish.jobs.publish.steps;
    const checkout = steps.find((step) => step.uses?.startsWith("actions/checkout@"));
    // oxlint-disable-next-line no-template-curly-in-string -- this asserts a literal GitHub Actions expression
    expect(checkout?.with?.ref).toBe("${{ github.event.repository.default_branch }}");
    expect(checkout?.with?.["persist-credentials"]).toBe(false);
    const download = steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
    // oxlint-disable-next-line no-template-curly-in-string -- this asserts a literal GitHub Actions expression
    expect(download?.with?.path).toBe("${{ runner.temp }}/visual-artifact");
    expect(steps.flatMap((step) => step.run ?? [])).toEqual([
      "node scripts/publish-visual-diff.ts",
    ]);
  });
});
