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
 * Whether a path or glob names the R2 token file in any spelling Windows opens as that file: any
 * case, trailing dots or spaces, or an NTFS stream suffix such as `::$DATA`. A glob counts only when
 * it starts with `.`, as a shell glob must to match a dotfile.
 */
export function namesR2TokenFile(target: string): boolean {
  const name = target.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const plain = name
    .replace(/:.*$/, "")
    .replace(/[.\s]+$/, "")
    .toLowerCase();
  if (!/[*?[]/.test(plain)) {
    return plain === R2_TOKEN_FILE;
  }
  if (!plain.startsWith(".")) {
    return false;
  }
  const pattern = plain
    .replaceAll(/[.+^${}()|\\]/g, String.raw`\$&`)
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  try {
    return new RegExp(`^${pattern}$`).test(R2_TOKEN_FILE);
  } catch {
    return true;
  }
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
  const words = targets.flatMap((target) => target.split(/[\s"'`;|&(),]+/));
  if (
    [...paths, ...words].some((word) => namesR2TokenFile(word)) ||
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
