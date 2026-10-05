import { describe, expect, it } from "vitest";

import { AcquisitionReferenceIndex } from "./reference-index.js";

describe("AcquisitionReferenceIndex", () => {
  it("resolves reviewed non-native IDs alongside native ones", () => {
    const index = AcquisitionReferenceIndex.from({
      native: { monsters: ["cat_void"] },
      reviewed: { monsters: ["any"] },
    });

    expect(index.has("monster", "cat_void")).toBe(true);
    expect(index.has("monster", "any")).toBe(true);
    expect(index.has("monster", "void_cat")).toBe(false);
  });

  it("throws when the game now defines a reviewed ID", () => {
    expect(() =>
      AcquisitionReferenceIndex.from({
        native: { quests: ["balors_crate"] },
        reviewed: { quests: ["balors_crate"] },
      }),
    ).toThrow('Obsolete reviewed reference: quest ID "balors_crate" is now defined by game data');
  });
});
