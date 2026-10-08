import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { allocateTests, enumerateTests, parseShard } from "./playwright-allocation.js";

import type { AllocationWeights } from "./playwright-allocation.js";

// Node runs Playwright's CLI directly: `pnpm exec` added ~0.5 s of startup to each listing (#707).
const playwrightCli = join(import.meta.dirname, "../node_modules/@playwright/test/cli.js");

async function listTests(args: string[] = []): Promise<string[]> {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [playwrightCli, "test", "--list", "--reporter=json", ...args],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return enumerateTests(JSON.parse(stdout) as Parameters<typeof enumerateTests>[0]);
}

const weights = { defaultDurationMs: 1, tests: { expensive: 10, medium: 5 } };

describe("accessibility duration allocation", () => {
  it("spreads expensive tests and covers unmeasured additions exactly once", () => {
    const tests = ["cheap", "expensive", "medium", "new", "other"];
    const shards = allocateTests(tests, weights, 2);
    expect(shards).toEqual([["expensive"], ["medium", "cheap", "new", "other"]]);
    expect(shards.flat().toSorted()).toEqual(tests.toSorted());
  });

  it("produces stable allocation regardless of enumeration order", () => {
    const tests = ["d", "c", "b", "a"];
    expect(allocateTests(tests, weights, 4)).toEqual(allocateTests(tests.toReversed(), weights, 4));
  });

  it("rejects selectors that would run the same test twice", () => {
    expect(() => allocateTests(["same", "same"], weights, 4)).toThrow("Duplicate");
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects invalid shard count %s", (count) => {
    expect(() => allocateTests(["test"], weights, count)).toThrow("Invalid shard count");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid duration %s",
    (duration) => {
      expect(() => allocateTests(["test"], { defaultDurationMs: duration, tests: {} }, 4)).toThrow(
        "finite and positive",
      );
    },
  );

  it("uses complete project, file, describe, and test titles in supported test-list format", () => {
    expect(
      enumerateTests({
        suites: [
          {
            suites: [
              {
                specs: [
                  {
                    file: "seo.spec.ts",
                    tests: [{ projectName: "" }, { projectName: "mobile" }],
                    title: "locale",
                  },
                ],
                title: "metadata",
              },
            ],
            title: "seo.spec.ts",
          },
        ],
      }),
    ).toEqual([
      "[] › seo.spec.ts › metadata › locale",
      "[mobile] › seo.spec.ts › metadata › locale",
    ]);
  });

  it("rejects ambiguous title delimiters", () => {
    expect(() =>
      enumerateTests({
        suites: [
          {
            specs: [
              {
                file: "file.spec.ts",
                tests: [{ projectName: "" }],
                title: "test › other",
              },
            ],
            title: "file",
          },
        ],
      }),
    ).toThrow("delimiters");
  });

  it("parses a one-based shard selector", () => {
    expect(parseShard("2/4")).toEqual({ index: 1, total: 4 });
  });

  it.each(["", "0/4", "5/4", "1/0", "1.5/4", "1/4-extra"])("rejects shard %s", (shard) => {
    expect(() => parseShard(shard)).toThrow(/shard index/);
  });
});

describe("supported Playwright selection", () => {
  it("enumerates every unsharded accessibility test exactly once across the actual test lists", async () => {
    const directory = mkdtempSync(join(tmpdir(), "mistria-allocation-"));
    try {
      const unsharded = await listTests();
      const measured = JSON.parse(
        readFileSync("tests/accessibility/duration-weights.json", "utf8"),
      ) as AllocationWeights;
      const shards = allocateTests(unsharded, measured, 4);
      const listed = await Promise.all(
        shards.map((testsInShard, index) => {
          const file = join(directory, `shard-${index}.txt`);
          writeFileSync(file, `${testsInShard.join("\n")}\n`);
          return listTests([`--test-list=${file}`]);
        }),
      );
      const selected = shards.flatMap((testsInShard, index) => {
        const actual = listed[index] ?? [];
        expect(actual.toSorted()).toEqual(testsInShard.toSorted());
        return actual;
      });
      expect(unsharded.length).toBeGreaterThan(0);
      expect(selected.toSorted()).toEqual(unsharded.toSorted());
      expect(new Set(selected).size).toBe(unsharded.length);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  }, 90_000);
});
