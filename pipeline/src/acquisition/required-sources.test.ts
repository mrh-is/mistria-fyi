import { describe, expect, it } from "vitest";

import { finalizeSources, requireSources } from "./required-sources.js";

import type { Source } from "#lib/types/acquisition.js";

const wishingWell: Source = { type: "wishing_well", cost: 100 };

describe("requireSources", () => {
  it("returns a non-empty source list unchanged", () => {
    const sources: Source[] = [wishingWell];
    expect(requireSources("items.turnip", sources)).toBe(sources);
  });

  it("throws, naming the entity, when the list is empty", () => {
    expect(() => requireSources("items.turnip", [])).toThrow(
      "items.turnip has no acquisition sources",
    );
  });
});

describe("finalizeSources", () => {
  it("keeps every other field and preserves key order", () => {
    // Built from entries so the fixture keeps its deliberately non-alphabetical order.
    const drafts = Object.fromEntries([
      ["b_hat", { slot: "head", sources: [wishingWell] }],
      ["a_hat", { slot: "head", sources: [{ type: "default" } as Source] }],
    ]);
    const finalized = finalizeSources("cosmetics", drafts);
    expect(finalized).toEqual(drafts);
    expect(Object.keys(finalized)).toEqual(["b_hat", "a_hat"]);
  });

  it("throws on the first entity without sources, naming its path", () => {
    expect(() =>
      finalizeSources("pets.skins", {
        mushroom: { sources: [wishingWell] },
        sapling: { sources: [] },
      }),
    ).toThrow("pets.skins.sapling has no acquisition sources");
  });
});
