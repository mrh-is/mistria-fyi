import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

interface ReportSuite {
  specs?: {
    file: string;
    tests: { projectName: string }[];
    title: string;
  }[];
  suites?: ReportSuite[];
  title: string;
}

interface TestReport {
  suites: ReportSuite[];
}

export interface AllocationWeights {
  defaultDurationMs: number;
  tests: Record<string, number>;
}

export function enumerateTests(report: TestReport): string[] {
  const tests: string[] = [];
  function visit(suite: ReportSuite, parents: string[]): void {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const tokens = [spec.file, ...parents, spec.title];
        if (tokens.some((token) => token.includes("›") || token.includes("\n"))) {
          throw new Error("Test titles cannot contain test-list delimiters or newlines");
        }
        tests.push(`[${test.projectName}] › ${tokens.join(" › ")}`);
      }
    }
    for (const child of suite.suites ?? []) visit(child, [...parents, child.title]);
  }
  // Playwright's first suite level names the file, which is already in spec.file.
  for (const suite of report.suites) visit(suite, []);
  return tests;
}

export function allocateTests(
  tests: string[],
  weights: AllocationWeights,
  shardCount: number,
): string[][] {
  if (!Number.isSafeInteger(shardCount) || shardCount < 1) throw new Error("Invalid shard count");
  if (new Set(tests).size !== tests.length) throw new Error("Duplicate test selector");
  const duration = (test: string): number => weights.tests[test] ?? weights.defaultDurationMs;
  if (
    [weights.defaultDurationMs, ...Object.values(weights.tests)].some(
      (weight) => !Number.isFinite(weight) || weight <= 0,
    )
  ) {
    throw new Error("Test durations must be finite and positive");
  }
  const shards: string[][] = Array.from({ length: shardCount }, () => []);
  const totals = Array.from({ length: shardCount }, () => 0);
  const ordered = tests.toSorted((a, b) => duration(b) - duration(a) || a.localeCompare(b, "en"));
  for (const test of ordered) {
    const index = totals.indexOf(Math.min(...totals));
    shards[index].push(test);
    totals[index] += duration(test);
  }
  const selected = shards.flat();
  if (selected.length !== tests.length || new Set(selected).size !== tests.length) {
    throw new Error("Allocation must include every unsharded test exactly once");
  }
  return shards;
}

export function parseShard(value: string): { index: number; total: number } {
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (match === null) throw new Error("Expected shard index/count");
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(total) || index < 1 || index > total) {
    throw new Error("Invalid shard index/count");
  }
  return { index: index - 1, total };
}

function main(): void {
  const shard = parseShard(process.argv[2] ?? "");
  const report = JSON.parse(
    execFileSync("pnpm", ["exec", "playwright", "test", "--list", "--reporter=json"], {
      encoding: "utf8",
    }),
  ) as TestReport;
  const weights = JSON.parse(
    readFileSync("tests/accessibility/duration-weights.json", "utf8"),
  ) as AllocationWeights;
  const tests = enumerateTests(report);
  const shards = allocateTests(tests, weights, shard.total);
  mkdirSync(".playwright-artifacts", { recursive: true });
  writeFileSync(".playwright-artifacts/test-list.txt", `${shards[shard.index].join("\n")}\n`);
  writeFileSync(
    ".playwright-artifacts/allocation.json",
    JSON.stringify(
      {
        counts: shards.map((testsInShard) => testsInShard.length),
        estimatedDurationMs: shards.map((testsInShard) =>
          testsInShard.reduce(
            (total, test) => total + (weights.tests[test] ?? weights.defaultDurationMs),
            0,
          ),
        ),
        fallbackTests: tests.filter((test) => weights.tests[test] === undefined),
        shards,
        totalTests: tests.length,
      },
      null,
      2,
    ),
  );
  console.log(
    `Allocated ${tests.length} tests exactly once across ${shard.total} shards; selected ${shards[shard.index].length}`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
