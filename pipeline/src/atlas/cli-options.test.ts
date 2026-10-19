import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CURRENT_GAME_VERSION } from "../game-version.js";
import { assertInsideOutputRoot, parseAtlasCliOptions } from "./cli-options.js";

describe("parseAtlasCliOptions", () => {
  it("parses a root, versions, & an output directory", () => {
    expect(
      parseAtlasCliOptions(["--", "input", "--version=v1.0.8", "--compare=1.0.7", "--out=atlas"]),
    ).toEqual({ assetsDir: "input", compare: "1.0.7", outDir: "atlas", version: "1.0.8" });
  });

  it("resolves the current version", () => {
    expect(parseAtlasCliOptions(["--version=current"]).version).toBe(CURRENT_GAME_VERSION);
  });

  it.each([
    [[], "Pass --version=X.Y.Z or --version=current."],
    [["--version=1.0"], "--version must be X.Y.Z or current, not 1.0."],
    [["--version=1.0.8", "--compare=1.0.8"], "--compare must name a different version."],
    [["--version=1.0.8", "--sprites"], "Unknown option: --sprites"],
    [["--version=1.0.8", "--version=1.0.7"], "Duplicate option: --version"],
    [["--version=1.0.8", "a", "b"], "Pass at most one game-files directory."],
  ])("rejects %j", (args, message) => {
    expect(() => parseAtlasCliOptions(args)).toThrow(message);
  });
});

describe("assertInsideOutputRoot", () => {
  const outputRoot = resolve("/repo/pipeline/output");

  it("accepts the output root & folders inside it", () => {
    expect(assertInsideOutputRoot(join(outputRoot, "atlas"), outputRoot)).toBe(
      join(outputRoot, "atlas"),
    );
    expect(assertInsideOutputRoot(outputRoot, outputRoot)).toBe(outputRoot);
  });

  it("rejects folders outside it", () => {
    expect(() => assertInsideOutputRoot(resolve("/repo/src"), outputRoot)).toThrow(
      "--out must be inside",
    );
    expect(() => assertInsideOutputRoot(resolve("/tmp/atlas"), outputRoot)).toThrow(
      "--out must be inside",
    );
  });
});
