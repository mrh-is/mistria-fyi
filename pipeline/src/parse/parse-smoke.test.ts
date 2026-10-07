import { describe, expect, it } from "vitest";

import { createAssetsFixture } from "../test-helpers.js";
import { parseFiddle } from "./parse-fiddle.js";
import { checkParseSmoke } from "./parse-smoke.js";

describe("checkParseSmoke", () => {
  it("accepts a structurally valid fixture of any version", () => {
    const parsed = parseFiddle(createAssetsFixture({ "future/new.toml": "enabled = true" }));
    expect(() => {
      checkParseSmoke(parsed);
    }).not.toThrow();
    expect(() => {
      checkParseSmoke(parsed, "v1.0.5");
    }).toThrow(/Expected 297/);
  });

  it("rejects an empty parsed tree", () => {
    const parsed = parseFiddle(createAssetsFixture({ "future/new.meta.toml": "enabled = true" }));
    expect(() => {
      checkParseSmoke(parsed);
    }).toThrow(/No TOML files/);
  });
});
