import "#scripts/lib/require-pinned-node";

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Label gate for vendored & generated paths (AGENTS.md, architecture boundaries), run by the "Guarded paths" workflow.
 *
 * A PR that changes a guarded path needs the matching label. A rename counts as touching both its
 * destination (`filename`) and its source (`previous_filename`), so moving a file out of a guarded
 * path is gated like editing it.
 */

export const GUARDS: { label: string; matches: (path: string) => boolean }[] = [
  { label: "shadcn-update", matches: (path) => path.startsWith("src/lib/components/ui/") },
  { label: "generated-data", matches: (path) => path === "src/lib/data/tracker-data.json" },
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Usage: check-guarded-paths.ts <files-json> with PR_LABELS (JSON array) in the environment.
  const files = JSON.parse(readFileSync(process.argv[2] ?? "", "utf8")) as PullFile[];
  const labels = JSON.parse(process.env.PR_LABELS ?? "[]") as string[];
  const errors = missingLabels(files, labels);
  for (const error of errors) {
    console.error(`::error::${error}`);
  }
  process.exitCode = errors.length > 0 ? 1 : 0;
}
