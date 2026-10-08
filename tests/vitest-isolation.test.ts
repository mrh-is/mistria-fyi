import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The `app`, `client`, `pipeline`, & `node` projects share one module registry per worker (#707), so
 * a module mock or registry reset in one file leaks into whichever files that worker runs next.
 * Those files opt into a fresh registry with the `*.isolated.test.ts` suffix (`isolated` project)
 * or `*.isolated.client.test.ts` (`client-isolated`). Spies, stubbed globals, & stubbed environment variables reset per test, so they're fine.
 */

const root = join(import.meta.dirname, "..");

/** Test files outside a per-file-isolated project (`isolated`, `client-isolated`, `cold`, & `assets`). */
function sharedRegistryFiles(): string[] {
  return execFileSync(
    "git",
    [
      "ls-files",
      "src/**/*.test.ts",
      "pipeline/**/*.test.ts",
      "eslint-rules/**/*.test.ts",
      "scripts/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    { cwd: root, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .filter((file) => !/\.(?:isolated|isolated\.client|cold|assets)\.test\.ts$/u.test(file));
}

const registryCall = /\bvi\.(?:mock|doMock|unmock|doUnmock|resetModules)\(/u;

describe("shared module registries", () => {
  it("hold no module mocks or registry resets", () => {
    const offenders = sharedRegistryFiles().filter((file) =>
      registryCall.test(readFileSync(join(root, file), "utf8")),
    );
    expect(
      offenders,
      "Rename these to *.isolated.test.ts or *.isolated.client.test.ts (outside src/, add an isolated project)",
    ).toEqual([]);
  });

  it("finds the files it guards", () => {
    expect(sharedRegistryFiles()).toEqual(
      expect.arrayContaining([
        "src/lib/engine/progress.test.ts",
        "src/routes/data/backup-card.client.test.ts",
      ]),
    );
  });
});
