import { describe, expect, it } from "vitest";

import { buildWeights } from "./playwright-allocation-weights.js";

function report(duration: number, status = "passed") {
  return {
    suites: [
      {
        specs: [
          {
            file: "a.spec.ts",
            tests: [
              {
                projectName: "",
                results: [
                  { duration: 99_999, status: "failed" },
                  { duration, status },
                ],
              },
            ],
            title: "works",
          },
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

describe("buildWeights", () => {
  it("takes the median passing duration, ignoring retries & unlisted tests", () => {
    const test = "[] › a.spec.ts › works";
    expect(buildWeights([report(100), report(300), report(200)], [test])).toEqual({
      defaultDurationMs: 200,
      tests: { [test]: 200 },
    });
  });

  it("refuses a listed test with no passing sample", () => {
    expect(() => buildWeights([report(100, "failed")], ["[] › a.spec.ts › works"])).toThrow(
      "No passing CI sample",
    );
  });
});
