import { readdirSync } from "node:fs";
import { posix } from "node:path";

const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Repo-relative paths with `/` separators on every platform. */
function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(posix.join(directory, entry.name))
      : [posix.join(directory, entry.name)],
  );
}

function violates(path: string): boolean {
  const name = posix.basename(path);
  const stem = name.replace(/^\+/, "").split(".")[0] ?? "";
  // Generated or framework files with their own conventions (paraglide output, `$types`).
  return stem !== "" && !stem.startsWith("$") && !kebab.test(stem);
}

export function sourceFilenameOffenders(directory: string): string[] {
  return walk(directory).filter(
    (path) => /\.(?:svelte|ts)$/.test(path) && !path.includes("/paraglide/") && violates(path),
  );
}
