import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";
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
async function listProjectFiles(cleanupChanged?: boolean): Promise<ListedFile[]> {
  const outputDirectory = mkdtempSync(join(tmpdir(), "vitest-projects-"));
  try {
    const outputFile = join(outputDirectory, "list.json");
    await promisify(execFile)(
      process.execPath,
      [join(root, "node_modules/vitest/vitest.mjs"), "list", "--filesOnly", `--json=${outputFile}`],
      {
        cwd: root,
        env: {
          ...process.env,
          ...(cleanupChanged === undefined
            ? {}
            : { VITEST_CLEANUP_CHANGED: String(cleanupChanged) }),
        },
      },
    );
    return (JSON.parse(readFileSync(outputFile, "utf8")) as ListedFile[]).map((entry) => ({
      file: relative(root, entry.file).split(sep).join("/"),
      projectName: entry.projectName,
    }));
  } finally {
    rmSync(outputDirectory, { force: true, recursive: true });
  }
}

function trackedTestFiles(): string[] {
  return execFileSync("git", ["ls-files", "*.test.ts"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter(
      (file) =>
        process.env.VITEST_CLEANUP_CHANGED !== "false" ||
        file !== "scripts/cleanup-merged-worktrees.test.ts",
    );
}

const byFile = (a: ListedFile, b: ListedFile) => a.file.localeCompare(b.file);

describe("Vitest projects", () => {
  const listing: { files: ListedFile[]; withoutCleanup: ListedFile[] } = {
    files: [],
    withoutCleanup: [],
  };

  // Both listings load the full Vite config; running them together halves the probe's wall time.
  beforeAll(async () => {
    [listing.files, listing.withoutCleanup] = await Promise.all([
      listProjectFiles(),
      listProjectFiles(false),
    ]);
  }, 60_000);

  it("run every tracked test file", () => {
    const listedFiles = new Set(listing.files.map((entry) => entry.file));
    expect(trackedTestFiles().filter((file) => !listedFiles.has(file))).toEqual([]);
  });

  it("excludes only cleanup when its script is unchanged", () => {
    const skipped = listing.withoutCleanup;
    expect(skipped.some(({ file }) => file === "scripts/cleanup-merged-worktrees.test.ts")).toBe(
      false,
    );
    expect(skipped.toSorted(byFile)).toEqual(
      listing.files
        .filter(({ file }) => file !== "scripts/cleanup-merged-worktrees.test.ts")
        .toSorted(byFile),
    );
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
