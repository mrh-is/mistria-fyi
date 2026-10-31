import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import capturedAudit from "./fixtures/nightly-audit.json";
import {
  auditFindings,
  recentSamples,
  reportNightly,
  synchronizeNightlyIssue,
  timingFindings,
} from "./nightly-report.js";

// Captured with pnpm 11.28.2 on October 31, 2026, in a temporary copy of the workspace with
// auditConfig removed: pnpm audit --audit-level=low --json. Higher severities below are synthetic.
const clearAudit = JSON.stringify({ ...capturedAudit, advisories: {} });
function advisoryAudit(severity = "moderate"): string {
  const report = structuredClone(capturedAudit);
  report.advisories["1243505"].severity = severity;
  return JSON.stringify(report);
}

describe("auditFindings", () => {
  it.each(["moderate", "high", "critical"])(
    "reports %s advisories with actionable links",
    async (severity) => {
      const run = vi.fn().mockResolvedValue(advisoryAudit(severity));
      const findings = await auditFindings(run);
      expect(run).toHaveBeenCalledExactlyOnceWith(
        "pnpm",
        ["audit", "--audit-level=moderate", "--json"],
        undefined,
        [0, 1],
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]).toContain("`deepmerge`");
      expect(findings[0]).toContain(severity);
      expect(findings[0]).toContain("https://github.com/advisories/GHSA-gcqx-w48m-w2h4");
    },
  );

  it("ignores the captured low advisory & lower severities", async () => {
    expect(await auditFindings(() => Promise.resolve(JSON.stringify(capturedAudit)))).toEqual([]);
    expect(await auditFindings(() => Promise.resolve(advisoryAudit("info")))).toEqual([]);
  });

  it("uses filtered advisories, since metadata still counts accepted exceptions", async () => {
    const report = JSON.parse(clearAudit) as typeof capturedAudit;
    report.metadata.vulnerabilities.high = 1;
    expect(await auditFindings(() => Promise.resolve(JSON.stringify(report)))).toEqual([]);
  });

  it.each([
    "not json",
    "null",
    "{}",
    '{"error":{"code":"ECONNRESET"}}',
    JSON.stringify({ ...capturedAudit, advisories: null }),
    JSON.stringify({ ...capturedAudit, metadata: {} }),
    JSON.stringify({ ...capturedAudit, error: { code: "ECONNRESET" } }),
    JSON.stringify({
      ...capturedAudit,
      metadata: { vulnerabilities: { ...capturedAudit.metadata.vulnerabilities, high: -1 } },
    }),
    JSON.stringify({ ...capturedAudit, advisories: { broken: {} } }),
    advisoryAudit("unknown"),
  ])("rejects unusable audit output: %s", async (output) => {
    await expect(auditFindings(() => Promise.resolve(output))).rejects.toThrow(
      /JSON|Dependency audit/u,
    );
  });
});

const sample = (elapsedMs: number, durations: Record<string, number> = {}) => ({
  elapsedMs,
  files: Object.entries(durations).map(([file, durationMs]) => ({
    durationMs,
    file,
    project: "node",
  })),
});

const relaySamples = (durationMs: number) =>
  Array.from({ length: 3 }, () => sample(80_000, { "relay/worker.test.ts": durationMs }));

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
    expect(timingFindings(relaySamples(22_000))).toEqual([]);
    expect(timingFindings(relaySamples(31_000))).toHaveLength(1);
  });

  it("uses only the runs that include a file, since the cleanup test doesn't always run", () => {
    const samples = [
      sample(80_000),
      sample(80_000, { "a.test.ts": 6000 }),
      sample(80_000),
      sample(80_000, { "a.test.ts": 6000 }),
      sample(80_000, { "a.test.ts": 6000 }),
    ];
    expect(timingFindings(samples)).toHaveLength(1);
  });

  it("ignores a file with too few samples, so one slow run of a new file can't file an issue", () => {
    const samples = [
      sample(80_000, { "new.test.ts": 9000 }),
      sample(80_000, { "new.test.ts": 9000 }),
      sample(80_000),
      sample(80_000),
    ];
    expect(timingFindings(samples)).toEqual([]);
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

/** Answers listings for the issue search & for `runIds`, recording anything that writes. */
function nightlyRunner(
  runIds: number[],
  cancelled: number[],
  audit: Error | string = clearAudit,
  issues: { body: string; number: number }[] = [],
) {
  const artifacts = artifactRunner(runIds, cancelled);
  const writes: string[][] = [];
  const bodies: string[] = [];
  const run = (command: string, args: string[], input?: string) => {
    if (command === "pnpm") {
      return audit instanceof Error ? Promise.reject(audit) : Promise.resolve(audit);
    }
    if (args[0] === "run") return artifacts.run(command, args);
    if (args[1] === "list") return Promise.resolve(JSON.stringify(issues));
    writes.push(args);
    if (input) bodies.push(input);
    return Promise.resolve("");
  };
  return { bodies, run, writes };
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

describe("reportNightly", () => {
  const workflowUrl = "https://example.test/run";

  it("fails when it can't read any timing artifact, so the report can't go dark quietly", async () => {
    const { run, writes } = nightlyRunner([1, 2, 3], [1, 2, 3]);
    vi.spyOn(console, "warn").mockReturnValue();
    await expect(reportNightly({ run, workflowUrl })).rejects.toThrow("No timing samples");
    expect(writes).toEqual([]);
    vi.restoreAllMocks();
  });

  it("leaves everything alone with too few samples to trust a median", async () => {
    const { run, writes } = nightlyRunner([1, 2], [], clearAudit, [
      { body: "<!-- mistria-nightly-report -->\nold findings", number: 42 },
    ]);
    vi.spyOn(console, "warn").mockReturnValue();
    await reportNightly({ run, workflowUrl });
    expect(writes).toEqual([]);
    vi.restoreAllMocks();
  });

  it("closes the existing issue only after timing & advisories both clear", async () => {
    const { run, writes } = nightlyRunner([1, 2, 3], [], clearAudit, [
      { body: "<!-- mistria-nightly-report -->\nold findings", number: 42 },
    ]);
    await reportNightly({ run, workflowUrl });
    expect(writes.map((args) => args.slice(0, 3))).toEqual([
      ["issue", "comment", "42"],
      ["issue", "close", "42"],
    ]);
  });

  it("reports the findings from enough samples", async () => {
    const { run, writes } = nightlyRunner([200_000, 200_001, 200_002], []);
    await reportNightly({ run, workflowUrl });
    expect(writes.map((args) => args.slice(0, 2))).toEqual([["issue", "create"]]);
  });

  it("reports advisories together with timing findings", async () => {
    const { bodies, run, writes } = nightlyRunner([200_000, 200_001, 200_002], [], advisoryAudit());
    await reportNightly({ run, workflowUrl });
    expect(writes.map((args) => args.slice(0, 2))).toEqual([["issue", "create"]]);
    expect(bodies[0]).toContain("`deepmerge`");
    expect(bodies[0]).toContain("median wall time");
    expect(bodies[0]).not.toContain("None of these fail a pull request");
  });

  it.each([{ ids: [1] }, { ids: [1, 2] }])(
    "reports advisories despite insufficient timing samples: $ids",
    async ({ ids }) => {
      const { bodies, run, writes } = nightlyRunner(ids, [], advisoryAudit());
      vi.spyOn(console, "warn").mockReturnValue();
      await reportNightly({ run, workflowUrl });
      expect(writes.map((args) => args.slice(0, 2))).toEqual([["issue", "create"]]);
      expect(bodies[0]).toContain("`deepmerge`");
      expect(bodies[0]).toContain("Timing");
      vi.restoreAllMocks();
    },
  );

  it("updates the existing issue with advisories before failing on zero timing samples", async () => {
    const { bodies, run, writes } = nightlyRunner([], [], advisoryAudit(), [
      { body: "<!-- mistria-nightly-report -->\nold findings", number: 42 },
    ]);
    await expect(reportNightly({ run, workflowUrl })).rejects.toThrow("No timing samples");
    expect(writes.map((args) => args.slice(0, 3))).toEqual([["issue", "edit", "42"]]);
    expect(bodies[0]).toContain("`deepmerge`");
    expect(bodies[0]).toContain("Timing report incomplete");
  });

  it.each(["not json", '{"error":{"code":"ECONNRESET"}}', new Error("pnpm exited with status 2")])(
    "fails without changing the issue when the audit couldn't run: %s",
    async (audit) => {
      const { run, writes } = nightlyRunner([1, 2, 3], [], audit);
      await expect(reportNightly({ run, workflowUrl })).rejects.toThrow(
        /JSON|Dependency audit|pnpm exited/u,
      );
      expect(writes).toEqual([]);
    },
  );

  it("publishes advisories even when listing timing runs fails", async () => {
    const runner = nightlyRunner([], [], advisoryAudit());
    const run = (command: string, args: string[], input?: string) =>
      args[0] === "run"
        ? Promise.reject(new Error("cannot list runs"))
        : runner.run(command, args, input);
    await expect(reportNightly({ run, workflowUrl })).rejects.toThrow("cannot list runs");
    expect(runner.bodies[0]).toContain("`deepmerge`");
    expect(runner.writes.map((args) => args.slice(0, 2))).toEqual([["issue", "create"]]);
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
