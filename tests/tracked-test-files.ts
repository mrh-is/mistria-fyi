import { execFileSync } from "node:child_process";

function listFiles(cwd: string, flags: string[]): string[] {
  return execFileSync("git", ["ls-files", ...flags, "--", "*.test.ts"], { cwd, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

/**
 * Tracked `*.test.ts` files that still exist in the working tree. Git keeps listing a deleted or
 * renamed file until the deletion is staged, and reading or listing that path would fail (#420).
 */
export function trackedTestFiles(cwd: string): string[] {
  const deleted = new Set(listFiles(cwd, ["--deleted"]));
  return listFiles(cwd, ["--cached"]).filter((file) => !deleted.has(file));
}
