import { describe, expect, it } from "vitest";

import { buildWeights } from "./playwright-allocation-weights.js";

function report(...results: { duration: number; status: string }[]) {
  return {
    suites: [
      {
        specs: [
          { file: "a.spec.ts", tests: [{ projectName: "", results }], title: "works" },
          {
            file: "a.spec.ts",
            tests: [{ projectName: "", results: [{ duration: 5, status: "passed" }] }],
            title: "removed",
          },
        ],
        title: "a.spec.ts",
      },
    ],
  };
}

const passed = (duration: number) => ({ duration, status: "passed" });
const failed = { duration: 99_999, status: "failed" };
const test = "[] › a.spec.ts › works";

describe("buildWeights", () => {
  it("takes the median passing duration, ignoring unlisted tests", () => {
    expect(
      buildWeights([report(passed(100)), report(passed(300)), report(passed(200))], [test]),
    ).toEqual({ defaultDurationMs: 200, tests: { [test]: 200 } });
  });

  it("ignores a test's retries", () => {
    expect(
      buildWeights([report(passed(100)), report(failed, passed(50_000))], [test]).tests[test],
    ).toBe(100);
  });

  it("refuses a listed test with no sample from a passing first attempt", () => {
    expect(() => buildWeights([report(failed, passed(100))], [test])).toThrow(
      "No passing CI sample",
    );
  });
});
