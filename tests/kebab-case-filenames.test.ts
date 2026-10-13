// AGENTS.md §6: files are `kebab-case`. SvelteKit's `+`-prefixed route files & `[param]`/`(group)`
// directories are framework syntax, so only the part after those markers is checked.
import { readdirSync } from "node:fs";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";

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

describe("source filenames", () => {
  it("are kebab-case for .svelte & .ts files under src/", () => {
    const offenders = walk("src").filter(
      (path) => /\.(?:svelte|ts)$/.test(path) && !path.includes("/paraglide/") && violates(path),
    );
    expect(offenders).toStrictEqual([]);
  });
});
