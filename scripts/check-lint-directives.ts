import "#scripts/lib/require-pinned-node";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Every oxlint or ESLint disable directive states why, as `-- reason`, matching the Stylelint
 * setting. ESLint already reports unused directives; oxlint's equivalent flag can't run here
 * because it also reports ESLint-owned `svelte/*` directives in `.svelte.ts` files as unused.
 */

/** A directive is a comment that starts its line, or follows code on a `-line` directive. */
const DIRECTIVE =
  /^\s*(?:\/\/|\/\*|<!--)\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?\b(.*)$|(?:\/\/|\/\*)\s*(?:eslint|oxlint)-disable-line\b(.*)$/;
const REASON = /\s--\s+\S/;

/** The 1-based line numbers of disable directives without a `-- reason`. */
export function unjustifiedDirectives(text: string): number[] {
  return text.split(/\r?\n/).flatMap((line, index) => {
    const match = DIRECTIVE.exec(line);
    if (match === null) {
      return [];
    }
    const rest = (match[1] ?? match[2] ?? "").replace(/\s*(?:\*\/|--!?>)\s*$/, "");
    return REASON.test(rest) ? [] : [index + 1];
  });
}

/** The files oxlint or ESLint lint, so the directives that can appear in them. */
export function lintedFiles(files: string[]): string[] {
  return files.filter((file) => /\.(?:[cm]?[jt]sx?|svelte)$/.test(file));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Usage: check-lint-directives.ts [paths...]; with no paths, every tracked file.
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const files = lintedFiles(
    args.length > 0
      ? args
      : execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0"),
  );
  let failed = false;
  for (const file of files) {
    for (const line of unjustifiedDirectives(readFileSync(file, "utf8"))) {
      console.error(
        `${file}:${line}: give this disable directive a reason ("-- why"), and keep it to the narrowest rule & line.`,
      );
      failed = true;
    }
  }
  process.exitCode = failed ? 1 : 0;
}
