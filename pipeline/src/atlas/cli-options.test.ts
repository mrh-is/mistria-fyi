import { describe, expect, it } from "vitest";

import { CURRENT_GAME_VERSION } from "../game-version.js";
import { parseAtlasCliOptions } from "./cli-options.js";

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
