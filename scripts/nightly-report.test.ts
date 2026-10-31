import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { recentSamples, synchronizeNightlyIssue, timingFindings } from "./nightly-report.js";

const sample = (elapsedMs: number, durations: Record<string, number> = {}) => ({
  elapsedMs,
  files: Object.entries(durations).map(([file, durationMs]) => ({
    durationMs,
    file,
    project: "node",
  })),
});

describe("timingFindings", () => {
  it("reports nothing when the typical run is within its lines", () => {
    const samples = [
      sample(80_000, { "a.test.ts": 1000 }),
      sample(90_000, { "a.test.ts": 1200 }),
      sample(100_000, { "a.test.ts": 900 }),
    ];
    expect(timingFindings(samples)).toEqual([]);
  });

  it("ignores one slow run, because it compares medians", () => {
    const samples = [
      sample(80_000, { "a.test.ts": 1000 }),
      sample(400_000, { "a.test.ts": 60_000 }),
      sample(90_000, { "a.test.ts": 1200 }),
    ];
    expect(timingFindings(samples)).toEqual([]);
  });

  it("reports a suite whose median wall time passed its line", () => {
    const samples = [sample(121_000), sample(125_000), sample(90_000)];
    expect(timingFindings(samples)).toEqual([
      "The Vitest step's median wall time is 121.0 s, over its 120 s line.",
    ]);
  });

  it("reports each file whose median passed its warning line, slowest first", () => {
    const samples = [
      sample(80_000, { "a.test.ts": 6000, "b.test.ts": 9000 }),
      sample(80_000, { "a.test.ts": 7000, "b.test.ts": 8000 }),
      sample(80_000, { "a.test.ts": 6500, "b.test.ts": 8500, "c.test.ts": 100 }),
    ];
    expect(timingFindings(samples)).toEqual([
      "`b.test.ts` has a median of 8.5 s, over its 5 s line.",
      "`a.test.ts` has a median of 6.5 s, over its 5 s line.",
    ]);
  });

  it("holds the real Workers integration to its own line", () => {
    const samples = [sample(80_000, { "relay/worker.test.ts": 22_000 })];
    expect(timingFindings(samples)).toEqual([]);
  });

  it("uses only the runs that include a file, since the cleanup test doesn't always run", () => {
    const samples = [sample(80_000), sample(80_000), sample(80_000, { "a.test.ts": 6000 })];
    expect(timingFindings(samples)).toHaveLength(1);
  });
});

function artifactRunner(runIds: number[], cancelled: number[] = []) {
  const downloaded: string[] = [];
  const listings: string[][] = [];
  const run = (_command: string, args: string[]) => {
    if (args[1] === "list") {
      listings.push(args);
      return Promise.resolve(JSON.stringify(runIds.map((databaseId) => ({ databaseId }))));
    }
    const id = args[2];
    downloaded.push(id);
    if (cancelled.includes(Number(id))) return Promise.reject(new Error("no artifact"));
    const directory = args.find((arg) => arg.startsWith("--dir="))?.slice("--dir=".length) ?? "";
    writeFileSync(join(directory, "timings.json"), JSON.stringify(sample(Number(id))));
    return Promise.resolve("");
  };
  return { downloaded, listings, run };
}

function recorder(issues: { body: string; number: number }[]) {
  const calls: { args: string[]; input?: string }[] = [];
  const run = (_command: string, args: string[], input?: string) => {
    calls.push({ args, input });
    return Promise.resolve(args[1] === "list" ? JSON.stringify(issues) : "");
  };
  const writes = () => calls.filter(({ args }) => args[1] !== "list");
  return { run, writes };
}

describe("recentSamples", () => {
  it("reads the timing artifacts from pushes to main, which don't collect coverage", async () => {
    const { listings, run } = artifactRunner([1, 2]);
    expect(await recentSamples(run)).toEqual([sample(1), sample(2)]);
    expect(listings[0]).toEqual(expect.arrayContaining(["--branch=main", "--event=push"]));
  });

  it("skips a run with no artifact, such as a cancelled one", async () => {
    const { run } = artifactRunner([1, 2, 3], [2]);
    vi.spyOn(console, "warn").mockReturnValue();
    const samples = await recentSamples(run);
    expect(samples.map(({ elapsedMs }) => elapsedMs)).toEqual([1, 3]);
    vi.restoreAllMocks();
  });

  it("stops downloading once it has enough samples", async () => {
    const { downloaded, run } = artifactRunner(Array.from({ length: 20 }, (_, index) => index));
    expect(await recentSamples(run)).toHaveLength(10);
    expect(downloaded).toHaveLength(10);
  });
});

describe("synchronizeNightlyIssue", () => {
  const workflowUrl = "https://example.test/run";
  const marked = { body: "<!-- mistria-nightly-report -->\nold findings", number: 42 };
  const unrelated = { body: "Discuss the Nightly CI report idea.", number: 7 };

  it("stays quiet when there are no findings & no open issue", async () => {
    const { run, writes } = recorder([unrelated]);
    await synchronizeNightlyIssue({ findings: [], run, workflowUrl });
    expect(writes()).toEqual([]);
  });

  it("files one issue with the findings, the run, & attribution", async () => {
    const { run, writes } = recorder([unrelated]);
    await synchronizeNightlyIssue({ findings: ["`a.test.ts` is slow."], run, workflowUrl });
    const [create] = writes();
    expect(writes()).toHaveLength(1);
    expect(create.args.slice(0, 2)).toEqual(["issue", "create"]);
    expect(create.input).toContain("<!-- mistria-nightly-report -->");
    expect(create.input).toContain("`a.test.ts` is slow.");
    expect(create.input).toContain(workflowUrl);
    expect(create.input?.trimEnd().endsWith("Agent: claude-code")).toBe(true);
  });

  it("updates the open issue in place, so a standing finding doesn't notify every night", async () => {
    const { run, writes } = recorder([marked]);
    await synchronizeNightlyIssue({ findings: ["`a.test.ts` is slower."], run, workflowUrl });
    const [edit] = writes();
    expect(writes()).toHaveLength(1);
    expect(edit.args).toEqual(["issue", "edit", "42", "--body-file", "-"]);
    expect(edit.input).toContain("<!-- mistria-nightly-report -->");
    expect(edit.input).toContain("`a.test.ts` is slower.");
  });

  it("closes the open issue once the findings clear", async () => {
    const { run, writes } = recorder([marked]);
    await synchronizeNightlyIssue({ findings: [], run, workflowUrl });
    expect(writes().map(({ args }) => args.slice(0, 3))).toEqual([
      ["issue", "comment", "42"],
      ["issue", "close", "42"],
    ]);
    expect(writes()[0].input?.trimEnd().endsWith("Agent: claude-code")).toBe(true);
  });
});
