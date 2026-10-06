import { describe, expect, it } from "vitest";

import { parseCliOptions } from "./cli-options.js";

describe("parseCliOptions", () => {
  it("accepts the documented flags and one assets directory", () => {
    expect(parseCliOptions(["--", "input/assets", "--version=1.0.5", "--sprites"])).toEqual({
      assetsDir: "input/assets",
      parseOnly: false,
      parseProfile: undefined,
      sprites: true,
      version: "1.0.5",
      villagerSpritesOnly: false,
    });
  });

  it.each(["--sprite", "--version", "--parse-profile=other"])(
    "rejects unknown or incomplete option %s",
    (option) => {
      expect(() => parseCliOptions([option])).toThrow(/option|profile|version/i);
    },
  );

  it("rejects extra positional paths and duplicate flags", () => {
    expect(() => parseCliOptions(["one", "two"])).toThrow(/one assets directory/);
    expect(() => parseCliOptions(["--sprites", "--sprites"])).toThrow(/Duplicate/);
  });

  it("requires parse-only for the explicit v1.0.5 profile", () => {
    expect(() => parseCliOptions(["--parse-profile=v1.0.5"])).toThrow(/--parse-only/);
    expect(parseCliOptions(["--parse-only", "--parse-profile=v1.0.5"]).parseProfile).toBe("v1.0.5");
  });
});
