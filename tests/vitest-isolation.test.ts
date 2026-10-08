import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The `app`, `client`, `pipeline`, & `node` projects share one module registry per worker (#707), so
 * a module mock or registry reset in one file leaks into whichever files that worker runs next.
 * Those files opt into a fresh registry with the `*.isolated.test.ts` suffix (the `isolated` &
 * `node-isolated` projects) or `*.isolated.client.test.ts` (`client-isolated`). The pipeline has
 * no isolated project, so its files can't opt out. Spies, stubbed globals, & stubbed environment
 * variables reset per test, so they're fine.
 */

const root = join(import.meta.dirname, "..");

/** Directories whose `*.isolated.test.ts` files run in a per-file-isolated project. */
const isolatedRoots = ["eslint-rules/", "scripts/", "src/", "tests/"];

/** Test files in a shared-registry project, including ones directly under each root. */
function sharedRegistryFiles(): string[] {
  // A `dir/**/*.test.ts` pathspec skips files directly in `dir/`, so list every test & filter.
  return execFileSync("git", ["ls-files", "*.test.ts"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((file) =>
      ["eslint-rules/", "pipeline/", "scripts/", "src/", "tests/"].some((dir) =>
        file.startsWith(dir),
      ),
    )
    .filter((file) => !/\.(?:cold|assets)\.test\.ts$/u.test(file))
    .filter(
      (file) =>
        !(
          /\.isolated(?:\.client)?\.test\.ts$/u.test(file) &&
          isolatedRoots.some((dir) => file.startsWith(dir))
        ),
    );
}

const registryCall = /\bvi\.(?:mock|doMock|unmock|doUnmock|resetModules)\(/u;

describe("shared module registries", () => {
  it("hold no module mocks or registry resets", () => {
    const offenders = sharedRegistryFiles().filter((file) =>
      registryCall.test(readFileSync(join(root, file), "utf8")),
    );
    expect(
      offenders,
      "Rename these to *.isolated.test.ts or *.isolated.client.test.ts (in pipeline/, add an isolated project)",
    ).toEqual([]);
  });

  it("finds the files it guards", () => {
    expect(sharedRegistryFiles()).toEqual(
      expect.arrayContaining([
        "src/lib/engine/progress.test.ts",
        "src/routes/data/backup-card.client.test.ts",
        "src/hooks.server.test.ts",
        "tests/vitest-projects.test.ts",
      ]),
    );
  });
});
