import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it, onTestFinished } from "vitest";

import { requireGameAssetsDir } from "./test-helpers.js";

function outputHashes(directory: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(hashes, outputHashes(path));
    else hashes[path] = createHash("sha256").update(readFileSync(path)).digest("hex");
  }
  return hashes;
}

it("fails a missing reviewed override target before publishing any output", () => {
  const assets = requireGameAssetsDir();
  const fixture = mkdtempSync(join(tmpdir(), "mistria-missing-target-"));
  onTestFinished(() => {
    rmSync(fixture, { force: true, recursive: true });
  });
  // Copy only the structured Fiddle subtree; shared game inputs remain read-only.
  cpSync(join(assets, "fiddle"), join(fixture, "fiddle"), { recursive: true });
  symlinkSync(join(assets, "localization"), join(fixture, "localization"), "dir");
  const itemFile = join(fixture, "fiddle/items/other/misc.toml");
  const contents = readFileSync(itemFile, "utf8");
  expect(contents).toMatch(/^\[big_egg\]/m);
  writeFileSync(itemFile, contents.replace(/^\[big_egg\][\s\S]*?(?=^\[|(?![\s\S]))/m, ""));
  const appData = resolve(import.meta.dirname, "../../src/lib/data");
  const before = outputHashes(appData);
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", resolve(import.meta.dirname, "main.ts"), fixture, "--version=1.0.6"],
    { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8", timeout: 15_000 },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/missing-target.*items.big_egg/);
  expect(result.stdout).not.toContain("Publishing outputs");
  expect(outputHashes(appData)).toEqual(before);
}, 20_000);
