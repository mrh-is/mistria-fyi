/**
 * Turns Vitest's `coverage/coverage-summary.json` (the v8 provider's `json-summary` reporter) into
 * Markdown for the CI job summary: one row per covered area, the total, and the least-covered
 * files. Run with `node scripts/coverage-summary.ts >> "$GITHUB_STEP_SUMMARY"` after
 * `pnpm run test:coverage`.
 */
import "#scripts/lib/require-pinned-node";

import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

interface Metric {
  covered: number;
  pct: number;
  total: number;
}

export interface FileCoverage {
  branches: Metric;
  functions: Metric;
  lines: Metric;
  statements: Metric;
}

export type CoverageSummary = Record<string, FileCoverage>;

/** The areas `vite.config.ts` measures, in the order the table lists them. */
const AREAS = ["src/lib/engine/", "src/lib/stores/", "pipeline/src/"] as const;
const METRICS = ["lines", "branches", "functions", "statements"] as const;
const LOWEST_FILE_COUNT = 10;

function percent(covered: number, total: number): string {
  return `${total === 0 ? 100 : Number(((covered / total) * 100).toFixed(1))}%`;
}

function cell({ covered, total }: Pick<Metric, "covered" | "total">): string {
  return `${percent(covered, total)} (${covered}/${total})`;
}

function sumMetrics(files: FileCoverage[]): Record<(typeof METRICS)[number], Metric> {
  const sum = (metric: (typeof METRICS)[number]) => {
    const covered = files.reduce((total, file) => total + file[metric].covered, 0);
    const total = files.reduce((count, file) => count + file[metric].total, 0);
    return { covered, pct: 0, total };
  };
  return {
    branches: sum("branches"),
    functions: sum("functions"),
    lines: sum("lines"),
    statements: sum("statements"),
  };
}

function row(label: string, coverage: Record<(typeof METRICS)[number], Metric>): string {
  return `| ${label} | ${METRICS.map((metric) => cell(coverage[metric])).join(" | ")} |`;
}

export function formatCoverageSummary(summary: CoverageSummary, root: string): string {
  const files = Object.entries(summary)
    .filter(([path]) => path !== "total")
    // Areas are written with `/`, so normalize Windows separators before grouping.
    .map(([path, coverage]) => ({ coverage, path: relative(root, path).split(sep).join("/") }));

  const areaRows = AREAS.map((area) =>
    row(
      `\`${area}\``,
      sumMetrics(files.filter(({ path }) => path.startsWith(area)).map(({ coverage }) => coverage)),
    ),
  );
  const totalRow = summary.total ? [row("**Total**", summary.total)] : [];

  const lowest = files
    .toSorted((first, second) => first.coverage.lines.pct - second.coverage.lines.pct)
    .slice(0, LOWEST_FILE_COUNT)
    .map(({ coverage, path }) => `| \`${path}\` | ${cell(coverage.lines)} |`);

  return [
    "## Coverage",
    "",
    "Reported for the domain logic, stores, & pipeline; not a gate.",
    "",
    "| Area | Lines | Branches | Functions | Statements |",
    "| --- | --- | --- | --- | --- |",
    ...areaRows,
    ...totalRow,
    "",
    "<details>",
    `<summary>${LOWEST_FILE_COUNT} least-covered files by lines</summary>`,
    "",
    "| File | Lines |",
    "| --- | --- |",
    ...lowest,
    "",
    "</details>",
    "",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(import.meta.dirname, "..");
  const summary = JSON.parse(
    readFileSync(resolve(root, "coverage/coverage-summary.json"), "utf8"),
  ) as CoverageSummary;
  process.stdout.write(formatCoverageSummary(summary, root));
}
