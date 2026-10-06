import { describe, expect, it } from "vitest";

import { formatCoverageSummary } from "./coverage-summary.js";

import type { CoverageSummary, FileCoverage } from "./coverage-summary.js";

const root = "/repo";

function metric(covered: number, total: number) {
  return { covered, pct: total === 0 ? 100 : Math.round((covered / total) * 10_000) / 100, total };
}

function file(lines: [number, number], branches: [number, number] = [1, 1]): FileCoverage {
  return {
    branches: metric(...branches),
    functions: metric(1, 1),
    lines: metric(...lines),
    statements: metric(...lines),
  };
}

const summary: CoverageSummary = {
  [`${root}/pipeline/src/main.ts`]: file([10, 100]),
  [`${root}/src/lib/engine/progress.ts`]: file([90, 100], [8, 10]),
  [`${root}/src/lib/engine/search.ts`]: file([50, 100]),
  [`${root}/src/lib/stores/user-state.svelte.ts`]: file([75, 100]),
  total: file([225, 400], [11, 13]),
};

describe("formatCoverageSummary", () => {
  it("summarizes each area and the total as a Markdown table", () => {
    const markdown = formatCoverageSummary(summary, root);

    expect(markdown).toContain("| Area | Lines | Branches | Functions | Statements |");
    expect(markdown).toContain("| `src/lib/engine/` | 70% (140/200) | 81.8% (9/11) |");
    expect(markdown).toContain("| `src/lib/stores/` | 75% (75/100) |");
    expect(markdown).toContain("| `pipeline/src/` | 10% (10/100) |");
    expect(markdown).toContain("| **Total** | 56.3% (225/400) | 84.6% (11/13) |");
  });

  it("lists the least-covered files by line coverage, lowest first", () => {
    const markdown = formatCoverageSummary(summary, root);
    const lowest = markdown.slice(markdown.indexOf("<details>"));

    expect(lowest.indexOf("pipeline/src/main.ts")).toBeLessThan(
      lowest.indexOf("src/lib/engine/search.ts"),
    );
    expect(lowest.indexOf("src/lib/engine/search.ts")).toBeLessThan(
      lowest.indexOf("src/lib/stores/user-state.svelte.ts"),
    );
  });

  it("states that coverage is reported, not enforced", () => {
    expect(formatCoverageSummary(summary, root)).toMatch(/not a gate/u);
  });
});
