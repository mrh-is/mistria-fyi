import { existsSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  canonicalPath,
  editPaths,
  mainCheckoutRoot,
  readHookInput,
  repositoryRoot,
  shellCommand,
  shellPaths,
  shellReadTargets,
  shellSegments,
} from "#scripts/lib/agent-hook";

import type { HookInput } from "#scripts/lib/agent-hook";

const tokenFilePatterns = [
  /(?:^|\/)\.config\/gh\/hosts\.yml$/,
  /(?:^|\/)\.wrangler\/config\/[^/]+\.toml$/,
];

const R2_TOKEN_FILE = ".env.r2-upload";
const R2_TOKEN_MESSAGE =
  "Blocked read of the R2 upload token file. The upload scripts load it; check it with `node scripts/machine-doctor.ts --for release` or `pnpm run r2:check`. To search the repository, use the Grep tool or plain `rg`, which skip gitignored files.";

/**
 * The index of the `]` closing the bracket expression at `open`, or -1 when it may never close or
 * when shells disagree about where it closes. A `]` right after the opening is a member. Bash lets
 * a class such as `[:alpha:]` or `[.].]` hold its own `]`, but zsh & PowerShell close the bracket
 * at the first `]`, so a word that reads differently in the two can't become one `?`.
 */
function bracketEnd(glob: string, open: number): number {
  let index = open + (/^\[[!^]/.test(glob.slice(open, open + 2)) ? 2 : 1);
  if (glob[index] === "]") {
    index += 1;
  }
  const firstClose = glob.indexOf("]", index);
  for (; index < glob.length; index += 1) {
    if (glob[index] === "]") {
      return index === firstClose ? index : -1;
    }
    if (glob[index] === "]") {
      return index;
    }
    const delimiter = glob[index + 1];
    if (glob[index] === "[" && (delimiter === ":" || delimiter === "." || delimiter === "=")) {
      const end = glob.indexOf(`${delimiter}]`, index + 2);
      if (end === -1) {
        return -1;
      }
      index = end + 1;
    }
  }
  return -1;
}

/**
 * Reduce a name to `*` & `?` wildcards, up to an NTFS stream suffix, so that it can only match more
 * than the shell would. Any closed bracket becomes `?`, which covers negation, classes, & dialects
 * without modeling them. A `[` that never closes is literal to a shell, but this word may be a
 * fragment of a bracket split at a quote or a separator, so it becomes `*`. The exception is jq's
 * `.[]`: with no later `]`, `[]` stays literal. Zsh matches any character with `[!]` & `[^]`.
 */
function widenedGlob(name: string): string {
  let glob = "";
  for (let index = 0; index < name.length; index += 1) {
    if (name[index] === ":") {
      break;
    }
    if (name[index] !== "[") {
      glob += name[index];
      continue;
    }
    const end = bracketEnd(name, index);
    if (end !== -1) {
      glob += "?";
      index = end;
    } else if (name.startsWith("[]", index) && !name.includes("]", index + 2)) {
      glob += "[";
    } else {
      return `${glob}*`;
    }
  }
  return glob;
}

/** Whether a glob of `*` & `?` matches all of `text`, in time linear in the glob's length. */
function globMatches(glob: string, text: string): boolean {
  // Whether the glob so far can match each prefix of `text`, by the prefix's length.
  let reachable = Array.from({ length: text.length + 1 }, (_, length) => length === 0);
  for (const part of glob) {
    const next = reachable.map(() => false);
    for (const [length, reached] of reachable.entries()) {
      if (part === "*") {
        next[length] = reached || (length > 0 && next[length - 1]);
      } else if (reached && length < text.length && (part === "?" || part === text[length])) {
        next[length + 1] = true;
      }
    }
    reachable = next;
  }
  return reachable[text.length];
}

/**
 * Whether a path or glob could name the R2 token file in any spelling Windows opens as that file:
 * any case, trailing dots or spaces, or an NTFS stream suffix such as `::$DATA`. POSIX shell globs
 * need a literal leading dot to match a dotfile; PowerShell wildcards don't.
 */
export function namesR2TokenFile(target: string, shell: "posix" | "powershell" = "posix"): boolean {
  const name = target.replaceAll("\\", "/").split("/").at(-1) ?? "";
  if (shell === "posix" && !name.startsWith(".")) {
    return false;
  }
  const glob = widenedGlob(name).toLowerCase();
  let end = glob.length;
  while (end > 0 && /[.\s]/.test(glob[end - 1])) {
    end -= 1;
  }
  return globMatches(glob.slice(0, end), R2_TOKEN_FILE);
}

// Searches that read gitignored files: `grep -r`, `rg -u`/`--no-ignore`, `git grep --no-index`,
// `findstr /s`, & PowerShell's recursive `Select-String`.
const RECURSIVE_SEARCH = [
  /(?:^|[\s/(])grep\s(?:[^|;&\n]*\s)?-(?:[a-zA-Z]*[rR][a-zA-Z]*|-recursive|-dereference-recursive)\b/,
  /(?:^|[\s/(])rg\s(?:[^|;&\n]*\s)?(?:-[a-zA-Z]*u|--no-ignore\S*)/,
  /\bgit\s+grep\s[^|;&\n]*--no-index/,
  /\bfindstr\b[^|;&\n]*\s\/s\b/i,
  /\b(?:select-string|sls)\b[^;\n]*-recurse\b/i,
  /\b(?:get-childitem|gci|ls|dir)\b[^|;\n]*\s-r(?:ecurse)?\b[^;\n]*\|\s*(?:select-string|sls)\b/i,
];

function within(root: string, path: string): boolean {
  const offset = relative(root.toLowerCase(), path.toLowerCase());
  return offset === "" || (!offset.startsWith("..") && !isAbsolute(offset));
}

/** The R2 token files a search from `cwd` could reach: the main checkout's & a stale worktree copy. */
function r2TokenFiles(cwd: string): string[] {
  const roots: string[] = [];
  for (const find of [mainCheckoutRoot, repositoryRoot]) {
    try {
      roots.push(find(cwd));
    } catch {
      // Outside a Git checkout, there is no token file to reach.
    }
  }
  // Canonicalize the root, not the file: a symlinked token file still sits in the checkout.
  return roots
    .map((root) => join(canonicalPath(root, "."), R2_TOKEN_FILE))
    .filter((file) => existsSync(file));
}

/** Whether a recursive search in `command` would read an existing R2 token file. */
function searchesR2TokenFile(command: string, cwd: string): boolean {
  const searches = shellSegments(command).filter(({ command: segment }) =>
    RECURSIVE_SEARCH.some((pattern) => pattern.test(segment)),
  );
  if (searches.length === 0) {
    return false;
  }
  const files = r2TokenFiles(cwd);
  // Compare physical paths: Git reports roots through symlinks such as macOS's `/var` → `/private/var`.
  return searches.some(({ command: segment }) => {
    const directories = shellPaths(segment)
      // Skip options, including `findstr`'s `/s` style.
      .filter((arg) => !arg.startsWith("-") && !/^\/[a-z]$/i.test(arg))
      .map((arg) => canonicalPath(cwd, arg))
      .filter((path) => existsSync(path) && statSync(path).isDirectory());
    const roots = directories.length > 0 ? directories : [canonicalPath(cwd, ".")];
    return roots.some((root) => files.some((file) => within(root, file)));
  });
}

/** Include the words inside inline programs as well as direct path arguments. */
function readTargetWords(targets: string[]): string[] {
  return targets.flatMap((target) => target.split(/[\s"'`;|&(),]+/));
}

export function readGuardMessage(input: HookInput): string | undefined {
  const cwd = input.cwd ?? process.cwd();
  const powershell =
    input.tool_name === "PowerShell" && typeof input.tool_input === "object"
      ? input.tool_input.command
      : undefined;
  const command = shellCommand(input) ?? (typeof powershell === "string" ? powershell : undefined);
  let targets = editPaths(input);
  if (typeof powershell === "string") {
    // PowerShell isn't parsed: every word it names counts as read.
    targets = shellPaths(powershell);
  } else if (command !== undefined) {
    targets = shellReadTargets(command);
  }
  const glob = typeof input.tool_input === "object" ? input.tool_input.glob : undefined;
  if (typeof glob === "string") {
    targets = [...targets, glob];
  }
  const paths = targets.flatMap((target) =>
    [resolve(cwd, target), canonicalPath(cwd, target)].map((path) => path.replaceAll("\\", "/")),
  );
  if (paths.some((path) => /(?:^|\/)src\/lib\/data\/tracker-data\.json$/.test(path))) {
    return "Blocked generated tracker data read. Read src/lib/types/tracker-data.ts or pipeline source instead.";
  }
  if (paths.some((path) => tokenFilePatterns.some((pattern) => pattern.test(path)))) {
    return "Blocked read of a stored OAuth token file. Use `gh auth status` or `pnpm exec wrangler whoami` instead.";
  }
  // A read target may hold a whole inline program (`powershell -c "Get-Content …"`).
  // Apply PowerShell rules only to its segments, so a neighboring `cat *` keeps POSIX semantics.
  let powershellTargets: string[] = [];
  if (typeof powershell === "string") {
    powershellTargets = targets;
  } else if (command !== undefined) {
    powershellTargets = shellSegments(command)
      .filter(({ command: segment }) =>
        readTargetWords(shellPaths(segment)).some((word) =>
          /(?:^|[/\\])(?:powershell|pwsh)(?:\.exe)?$/i.test(word),
        ),
      )
      .flatMap(({ command: segment }) => shellPaths(segment));
  }
  if (
    [...paths, ...readTargetWords(targets)].some((word) => namesR2TokenFile(word)) ||
    readTargetWords(powershellTargets).some((word) => namesR2TokenFile(word, "powershell")) ||
    (command !== undefined && searchesR2TokenFile(command, cwd))
  ) {
    return R2_TOKEN_MESSAGE;
  }
  return undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const message = readGuardMessage(readHookInput());
  if (message) {
    console.error(message);
    process.exitCode = 2;
  }
}
