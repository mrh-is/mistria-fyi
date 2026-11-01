import { describe, expect, it, vi } from "vitest";

import { summarizeFailureContext } from "./ci-failure-context.js";

const jobs = (...names: string[]) => ({
  jobs: names.map((name) => ({ conclusion: "failure", name })),
});
const mainRuns = [
  { conclusion: "cancelled", databaseId: 101 },
  { conclusion: "failure", databaseId: 100 },
  { conclusion: "failure", databaseId: 99 },
];

function runner(pr = jobs("Test"), main = jobs("Test"), runs = mainRuns) {
  return vi
    .fn()
    .mockResolvedValueOnce(JSON.stringify(pr))
    .mockResolvedValueOnce(JSON.stringify(runs))
    .mockResolvedValueOnce(JSON.stringify(main));
}

const options = { repository: "mrh-is/mistria-fyi", runId: "200" };

describe("CI failure context", () => {
  it("names shared failures, including exact matrix names, & links the latest non-cancelled main push", async () => {
    const run = runner(jobs("Test", "Accessibility (1/4)", "CI passed", "Lint"), {
      jobs: [
        ...jobs("Test", "Accessibility (1/4)", "Accessibility (2/4)", "CI passed").jobs,
        { conclusion: "success", name: "Lint" },
      ],
    });
    const summary = await summarizeFailureContext({ ...options, run });
    expect(summary).toContain("also failing on `main`");
    expect(summary).toContain("- Test\n");
    expect(summary).toContain("- Accessibility (1/4)\n");
    expect(summary).not.toMatch(/CI passed|Lint|Accessibility \(2\/4\)/u);
    expect(summary).toContain("https://github.com/mrh-is/mistria-fyi/actions/runs/100");
    expect(summary).toContain("doesn’t establish a shared cause");
    expect(run.mock.calls).toEqual([
      ["gh", ["run", "view", "200", "--repo", options.repository, "--json", "jobs"]],
      [
        "gh",
        [
          "run",
          "list",
          "--repo",
          options.repository,
          "--workflow",
          "ci.yml",
          "--branch",
          "main",
          "--event",
          "push",
          "--status",
          "completed",
          "--limit",
          "100",
          "--json",
          "databaseId,conclusion",
        ],
      ],
      ["gh", ["run", "view", "100", "--repo", options.repository, "--json", "jobs"]],
    ]);
  });

  it("writes nothing for a passing PR, even if main fails", async () => {
    const run = runner({ jobs: [{ conclusion: "success", name: "Test" }] });
    expect(await summarizeFailureContext({ ...options, run })).toBe("");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each([
    { runs: [{ conclusion: "success", databaseId: 100 }] },
    { runs: [{ conclusion: "cancelled", databaseId: 100 }] },
    { runs: [] },
  ])("writes nothing when main has no eligible failed run: %j", async ({ runs }) => {
    const run = runner(jobs("Test"), jobs("Test"), runs);
    expect(await summarizeFailureContext({ ...options, run })).toBe("");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("doesn’t look back past a newer successful main run", async () => {
    const run = runner(jobs("Test"), jobs("Test"), [
      { conclusion: "success", databaseId: 102 },
      ...mainRuns,
    ]);
    expect(await summarizeFailureContext({ ...options, run })).toBe("");
  });

  it("requires the same failed job, not merely a failed workflow", async () => {
    const run = runner(jobs("Accessibility (1/4)"), jobs("Accessibility (2/4)", "CI passed"));
    expect(await summarizeFailureContext({ ...options, run })).toBe("");
  });

  it.each([0, 1, 2])("keeps API failure %i informational", async (failureIndex) => {
    const outputs = [jobs("Test"), mainRuns, jobs("Test")];
    let index = 0;
    const run = vi.fn(() => {
      if (index++ === failureIndex) return Promise.reject(new Error("gh unavailable"));
      return Promise.resolve(JSON.stringify(outputs[index - 1]));
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(await summarizeFailureContext({ ...options, run })).toBe("");
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("ignores the aggregate job alone", async () => {
    const run = runner(jobs("CI passed"));
    expect(await summarizeFailureContext({ ...options, run })).toBe("");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
