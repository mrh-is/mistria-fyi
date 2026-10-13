import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parseCliOptions, resolveCallerPath } from "./cli-options.js";

describe("parseCliOptions", () => {
  it("accepts the documented flags and one assets directory", () => {
    expect(parseCliOptions(["--", "input/assets", "--version=1.0.7", "--sprites"])).toEqual({
      assetsDir: "input/assets",
      parseOnly: false,
      parseProfile: undefined,
      sprites: true,
      version: "1.0.7",
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

  it("requires parse-only for the explicit v1.0.7 profile", () => {
    expect(() => parseCliOptions(["--parse-profile=v1.0.7"])).toThrow(/--parse-only/);
    expect(parseCliOptions(["--parse-only", "--parse-profile=v1.0.7"]).parseProfile).toBe("v1.0.7");
  });
});

describe("resolveCallerPath", () => {
  it("resolves relative paths against pnpm's invoking directory", () => {
    expect(
      resolveCallerPath("pipeline/input/assets", { INIT_CWD: "/repo" }, "/repo/pipeline"),
    ).toBe(resolve("/repo/pipeline/input/assets"));
  });

  it("falls back to the process cwd outside pnpm", () => {
    expect(resolveCallerPath("input/assets", {}, "/repo/pipeline")).toBe(
      resolve("/repo/pipeline/input/assets"),
    );
  });

  it("keeps absolute paths", () => {
    expect(resolveCallerPath("/game/assets", { INIT_CWD: "/repo" }, "/elsewhere")).toBe(
      resolve("/game/assets"),
    );
  });
});
