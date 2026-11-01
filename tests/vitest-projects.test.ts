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
  const listing: { files: ListedFile[]; gated: ListedFile[] } = { files: [], gated: [] };

  // Both listings load the full Vite config; running them together halves the probe's wall time.
  // Each extra listing costs about 3 s on CI's two cores, so one listing covers every gate.
  beforeAll(async () => {
    [listing.files, listing.gated] = await Promise.all([
      listProjectFiles([]),
      listProjectFiles(gates),
    ]);
  }, 60_000);

  it("run every tracked test file", () => {
    const listedFiles = new Set(listing.files.map((entry) => entry.file));
    expect(trackedTestFiles().filter((file) => !listedFiles.has(file))).toEqual([]);
  });

  // These three load the browser suites' specs, fixtures, or app modules, which app & test changes
  // can break. Every other scripts/ test reads only scripts/, pipeline/, & the CI filter's inputs.
  it("exclude only the relay & other scripts/ tests when every gate is off", () => {
    const alwaysRun = [
      "scripts/playwright-allocation.test.ts",
      "scripts/playwright-satoshi.test.ts",
      "scripts/sprites/sprite-manifest.test.ts",
    ];
    const gatedTests = trackedTestFiles().filter(
      (file) => file.startsWith("relay/") || file.startsWith("scripts/"),
    );
    expect(gatedTests).toEqual(
      expect.arrayContaining([
        ...alwaysRun,
        "relay/worker.test.ts",
        "scripts/cleanup-merged-worktrees.test.ts",
      ]),
    );
    const kept = new Set(listing.gated.map(({ file }) => file));
    expect(
      listing.files
        .filter(({ file }) => !kept.has(file))
        .map(({ file }) => file)
        .toSorted(),
    ).toEqual(gatedTests.filter((file) => !alwaysRun.includes(file)).toSorted());
    // Every file the gated listing keeps stays in its project.
    expect(listing.gated.toSorted(byFile)).toEqual(
      listing.files.filter(({ file }) => kept.has(file)).toSorted(byFile),
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
