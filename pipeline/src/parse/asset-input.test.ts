import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_ASSETS_DIR } from "./asset-input.js";

describe("DEFAULT_ASSETS_DIR", () => {
  it("points at pipeline/input/assets regardless of the working directory", () => {
    expect(DEFAULT_ASSETS_DIR).toBe(resolve(import.meta.dirname, "../../input/assets"));
    expect(DEFAULT_ASSETS_DIR.endsWith(`${sep}${join("pipeline", "input", "assets")}`)).toBe(true);
  });
});
