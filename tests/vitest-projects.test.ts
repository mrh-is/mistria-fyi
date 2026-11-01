import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

import { toPosixPath } from "#scripts/lib/paths";

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

/** The environment variables CI sets to skip test files a pull request can't affect. */
const gates = ["VITEST_CLEANUP_CHANGED", "VITEST_RELAY_CHANGED", "VITEST_SCRIPTS_CHANGED"] as const;

/**
 * Every test file Vitest's projects collect, as repo-relative paths with their project names. Each
 * gate in `unchanged` is set to "false"; the others are unset, whatever this run's environment says.
 */
async function listProjectFiles(
  unchanged: readonly (typeof gates)[number][],
): Promise<ListedFile[]> {
  const outputDirectory = mkdtempSync(join(tmpdir(), "vitest-projects-"));
  try {
    const outputFile = join(outputDirectory, "list.json");
    const env = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([name]) => !(gates as readonly string[]).includes(name),
        ),
      ),
      ...Object.fromEntries(unchanged.map((gate) => [gate, "false"])),
    };
    await promisify(execFile)(
      process.execPath,
      [join(root, "node_modules/vitest/vitest.mjs"), "list", "--filesOnly", `--json=${outputFile}`],
      { cwd: root, env },
    );
    return (JSON.parse(readFileSync(outputFile, "utf8")) as ListedFile[]).map((entry) => ({
      file: toPosixPath(relative(root, entry.file)),
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

const byFile = (a: ListedFile, b: ListedFile) => a.file.localeCompare(b.file);

describe("Vitest projects", () => {
  const listing = {
    files: [] as ListedFile[],
    withoutCleanup: [] as ListedFile[],
    withoutRelay: [] as ListedFile[],
    withoutScripts: [] as ListedFile[],
  };

  /** The files a gated listing drops, after checking it keeps every other file in its project. */
  function skippedBy(gated: ListedFile[]): string[] {
    const kept = new Set(gated.map(({ file }) => file));
    expect(gated.toSorted(byFile)).toEqual(
      listing.files.filter(({ file }) => kept.has(file)).toSorted(byFile),
    );
    return listing.files
      .filter(({ file }) => !kept.has(file))
      .map(({ file }) => file)
      .toSorted();
  }

  // Each listing loads the full Vite config; running them together cuts the probe's wall time.
  beforeAll(async () => {
    [listing.files, listing.withoutCleanup, listing.withoutRelay, listing.withoutScripts] =
      await Promise.all([
        listProjectFiles([]),
        listProjectFiles(["VITEST_CLEANUP_CHANGED"]),
        listProjectFiles(["VITEST_RELAY_CHANGED"]),
        listProjectFiles(["VITEST_SCRIPTS_CHANGED"]),
      ]);
  }, 60_000);

  it("run every tracked test file", () => {
    const listedFiles = new Set(listing.files.map((entry) => entry.file));
    expect(trackedTestFiles().filter((file) => !listedFiles.has(file))).toEqual([]);
  });

  it("excludes only cleanup when its script is unchanged", () => {
    expect(skippedBy(listing.withoutCleanup)).toEqual(["scripts/cleanup-merged-worktrees.test.ts"]);
  });

  it("excludes only the relay tests when the relay is unchanged", () => {
    const relayTests = trackedTestFiles().filter((file) => file.startsWith("relay/"));
    expect(relayTests).toContain("relay/worker.test.ts");
    expect(skippedBy(listing.withoutRelay)).toEqual(relayTests.toSorted());
  });

  // These three load the browser suites' specs, fixtures, or app modules, which app & test changes
  // can break. Every other scripts/ test reads only scripts/, pipeline/, & the CI filter's inputs.
  it("excludes every other scripts/ test when scripts/ is unchanged", () => {
    const alwaysRun = [
      "scripts/playwright-allocation.test.ts",
      "scripts/playwright-satoshi.test.ts",
      "scripts/sprites/sprite-manifest.test.ts",
    ];
    const scriptTests = trackedTestFiles().filter((file) => file.startsWith("scripts/"));
    expect(scriptTests).toEqual(expect.arrayContaining(alwaysRun));
    expect(skippedBy(listing.withoutScripts)).toEqual(
      scriptTests.filter((file) => !alwaysRun.includes(file)).toSorted(),
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
