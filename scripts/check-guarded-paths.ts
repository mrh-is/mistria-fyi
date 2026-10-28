import "#scripts/lib/require-pinned-node";

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Label gate for generated paths (AGENTS.md, architecture boundaries), run by the "Guarded paths" workflow.
 *
 * A PR that changes a guarded path needs the matching label. A rename counts as touching both its
 * destination (`filename`) and its source (`previous_filename`), so moving a file out of a guarded
 * path is gated like editing it. A PR that changes the tracker data also carries `pnpm run data:diff`
 * output in its body, so reviewers see the path-level changes.
 */

const TRACKER_DATA = "src/lib/data/tracker-data.json";

/** `data:diff`'s summary line (`formatSummary`) or its no-change line. */
const DATA_DIFF_OUTPUT = /^\d+ added, \d+ removed, \d+ changed$|^No tracker data changes from /m;

export const GUARDS: { label: string; matches: (path: string) => boolean }[] = [
  { label: "generated-data", matches: (path) => path === TRACKER_DATA },
];

/** The fields of GitHub's "list pull request files" response that matter here. */
export interface PullFile {
  filename: string;
  previous_filename?: string;
}

/** One error per guarded path set that changed without its label. */
export function missingLabels(files: PullFile[], labels: string[]): string[] {
  const paths = files.flatMap((file) =>
    file.previous_filename === undefined
      ? [file.filename]
      : [file.filename, file.previous_filename],
  );
  return GUARDS.filter(
    ({ label, matches }) => paths.some((path) => matches(path)) && !labels.includes(label),
  ).map(({ label }) => `A guarded path changed without the "${label}" label.`);
}

/** One error when the tracker data changed but the PR body lacks `data:diff` output. */
export function missingDataDiff(files: PullFile[], body: string): string[] {
  return files.some((file) => file.filename === TRACKER_DATA) && !DATA_DIFF_OUTPUT.test(body)
    ? [
        'The tracker data changed, but the PR body has no "pnpm run data:diff" output; include its listing in a collapsed <details> block, or its summary line plus representative changes.',
      ]
    : [];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Usage: check-guarded-paths.ts <files-json> with PR_BODY & PR_LABELS (JSON array) in the
  // environment.
  const files = JSON.parse(readFileSync(process.argv[2] ?? "", "utf8")) as PullFile[];
  const labels = JSON.parse(process.env.PR_LABELS ?? "[]") as string[];
  const errors = [
    ...missingLabels(files, labels),
    ...missingDataDiff(files, process.env.PR_BODY ?? ""),
  ];
  for (const error of errors) {
    console.error(`::error::${error}`);
  }
  process.exitCode = errors.length > 0 ? 1 : 0;
}
