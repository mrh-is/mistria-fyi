import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Every tracked test file must run somewhere, and exactly once. A file no project includes (or one
 * a project's exclude swallows) passes silently forever; a file two projects include runs twice.
 * This asks Vitest itself which project owns each file, so it checks the real include & exclude
 * resolution rather than a copy of the globs.
 */

const root = join(import.meta.dirname, "..");

interface ListedFile {
  file: string;
  projectName: string;
}

/** Every test file Vitest's projects collect, as repo-relative paths with their project names. */
function listProjectFiles(): ListedFile[] {
  const outputDirectory = mkdtempSync(join(tmpdir(), "vitest-projects-"));
  try {
    const outputFile = join(outputDirectory, "list.json");
    execFileSync(
      process.execPath,
      [join(root, "node_modules/vitest/vitest.mjs"), "list", "--filesOnly", `--json=${outputFile}`],
      { cwd: root, stdio: "ignore" },
    );
    return (JSON.parse(readFileSync(outputFile, "utf8")) as ListedFile[]).map((entry) => ({
      file: relative(root, entry.file),
      projectName: entry.projectName,
    }));
  } finally {
    rmSync(outputDirectory, { force: true, recursive: true });
  }
}

function trackedTestFiles(): string[] {
  return execFileSync("git", ["ls-files", "*.test.ts"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

describe("Vitest projects", () => {
  const listing: { files: ListedFile[] } = { files: [] };

  beforeAll(() => {
    listing.files = listProjectFiles();
  }, 60_000);

  it("run every tracked test file", () => {
    const listedFiles = new Set(listing.files.map((entry) => entry.file));
    expect(trackedTestFiles().filter((file) => !listedFiles.has(file))).toEqual([]);
  });

  it("run each test file in exactly one project", () => {
    const projectsByFile = Map.groupBy(listing.files, (entry) => entry.file);
    const duplicates = [...projectsByFile]
      .filter(([, entries]) => entries.length > 1)
      .map(([file, entries]) => `${file}: ${entries.map((entry) => entry.projectName).join(", ")}`);
    expect(duplicates).toEqual([]);
  });

  it("keep pipeline tests out of the app projects", () => {
    const misplaced = listing.files.filter(
      (entry) =>
        entry.file.startsWith("pipeline/") && !["assets", "pipeline"].includes(entry.projectName),
    );
    expect(misplaced).toEqual([]);
  });
});
