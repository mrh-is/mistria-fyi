import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";

import { writeStoredZipFixture } from "./test-helpers.js";

function runPipeline(args: readonly string[]) {
  return spawnSync(process.execPath, ["--import=tsx", `${import.meta.dirname}/main.ts`, ...args], {
    cwd: import.meta.dirname,
    encoding: "utf8",
  });
}

describe("pipeline CLI", () => {
  it("rejects unknown flags before resolving an assets path", () => {
    const result = runPipeline(["--sprite"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown option: --sprite");
  });

  it("rejects a zip-only full run before parsing its contents", () => {
    const zipPath = writeStoredZipFixture({ "assets/fiddle/broken.toml": "invalid = [" });
    const result = runPipeline([dirname(zipPath)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Full pipeline extraction requires an on-disk fiddle/");
    expect(result.stderr).not.toContain("Failed to parse");
  });

  it("runs a version-independent parse smoke test directly against a zip", () => {
    const zipPath = writeStoredZipFixture({ "assets/fiddle/future/new.toml": "enabled = true" });
    const result = runPipeline([dirname(zipPath), "--parse-only"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Parse-only structural smoke test passed");
  });
});
