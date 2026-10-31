import "#scripts/lib/require-pinned-node";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parse } from "svelte/compiler";
import ts from "typescript";

/**
 * Every oxlint or ESLint disable directive states why, as `-- reason`, matching the Stylelint
 * setting. ESLint already reports unused directives; oxlint's equivalent flag can't run here
 * because it also reports ESLint-owned `svelte/*` directives in `.svelte.ts` files as unused.
 *
 * Comments come from the TypeScript & Svelte parsers, not pattern matching, so directive-shaped
 * text in strings or templates never counts and comment delimiters parse as the linters see them.
 */

interface Comment {
  /** 1-based line of the comment's start. */
  line: number;
  /** The comment's text without its delimiters. */
  text: string;
}

const DIRECTIVE = /^(?:eslint|oxlint)-disable(?:-next-line|-line)?(?:\s|$)/;
const REASON = /\s--\s+\S/;

/** Every comment in a JavaScript or TypeScript file, in source order. */
function scriptComments(file: string, text: string): Comment[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const seen = new Set<number>();
  const comments: Comment[] = [];
  const collect = (ranges: ts.CommentRange[] | undefined) => {
    for (const { end, kind, pos } of ranges ?? []) {
      if (seen.has(pos)) {
        continue;
      }
      seen.add(pos);
      const raw = text.slice(pos, end);
      comments.push({
        line: source.getLineAndCharacterOfPosition(pos).line + 1,
        text: kind === ts.SyntaxKind.SingleLineCommentTrivia ? raw.slice(2) : raw.slice(2, -2),
      });
    }
  };
  const visit = (node: ts.Node) => {
    collect(ts.getLeadingCommentRanges(text, node.getFullStart()));
    collect(ts.getTrailingCommentRanges(text, node.getEnd()));
    for (const child of node.getChildren(source)) {
      visit(child);
    }
  };
  visit(source);
  return comments.toSorted((a, b) => a.line - b.line);
}

/** Every script & template comment in a Svelte component, in source order. */
function svelteComments(text: string): Comment[] {
  const root = parse(text, { modern: true });
  const comments: Comment[] = root.comments.map((comment) => ({
    line: comment.loc?.start.line ?? 0,
    text: comment.value,
  }));
  const visit = (value: unknown) => {
    if (typeof value !== "object" || value === null) {
      return;
    }
    if ("type" in value && value.type === "Comment" && "start" in value && "data" in value) {
      const start = value.start as number;
      comments.push({
        line: text.slice(0, start).split("\n").length,
        text: value.data as string,
      });
    }
    for (const child of Object.values(value)) {
      visit(child);
    }
  };
  visit(root.fragment);
  return comments.toSorted((a, b) => a.line - b.line);
}

/** The 1-based line numbers of disable directives without a `-- reason`. */
export function unjustifiedDirectives(file: string, text: string): number[] {
  if (!text.includes("-disable")) {
    return [];
  }
  const comments = file.endsWith(".svelte") ? svelteComments(text) : scriptComments(file, text);
  return comments
    .filter(({ text: comment }) => DIRECTIVE.test(comment.trim()) && !REASON.test(comment))
    .map(({ line }) => line);
}

/** The files oxlint or ESLint lint, so the directives that can appear in them. */
export function lintedFiles(files: string[]): string[] {
  return files.filter((file) => /\.(?:[cm]?[jt]sx?|svelte)$/.test(file));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Usage: check-lint-directives.ts [paths...]; with no paths, every tracked or untracked, non-ignored file.
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const files = lintedFiles(
    args.length > 0
      ? args
      : execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
          encoding: "utf8",
        }).split("\0"),
  );
  const fromGit = args.length === 0;
  let failed = false;
  for (const file of new Set(files)) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (error) {
      // An unstaged delete or rename leaves the old path in the index; the replacement is untracked.
      if (fromGit && (error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }
    for (const line of unjustifiedDirectives(file, text)) {
      console.error(
        `${file}:${line}: give this disable directive a reason ("-- why"), and keep it to the narrowest rule & line.`,
      );
      failed = true;
    }
  }
  process.exitCode = failed ? 1 : 0;
}
