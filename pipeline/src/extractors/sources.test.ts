import { afterEach, describe, expect, it, vi } from "vitest";

import { extractSources } from "./sources.js";

import type { ParsedGameData } from "../parse-fiddle.js";

describe("extractSources", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits furniture recipe targets before cooked dishes regardless of root insertion order", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fiddle = {
      items: Object.fromEntries([
        [
          "other",
          {
            cooked_dishes: {
              soup: { recipe: [{ count: 1, item: "turnip" }] },
            },
          },
        ],
        [
          "furniture",
          {
            chairs: {
              chair: { recipe: [{ count: 1, item: "wood" }] },
            },
          },
        ],
      ]),
    } as unknown as ParsedGameData;

    const sources = extractSources(fiddle);

    expect(Object.keys(sources)).toEqual(["chair", "soup"]);
    expect(sources).toEqual({
      chair: [{ type: "craft" }],
      soup: [{ type: "cook" }],
    });
  });
});
