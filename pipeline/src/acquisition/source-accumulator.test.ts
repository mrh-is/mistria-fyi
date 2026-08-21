import { describe, expect, it } from "vitest";

import { CosmeticSourceAccumulator, ItemSourceAccumulator } from "./source-accumulator.js";

import type { Source } from "$lib/types/acquisition.js";
import type { CosmeticId, ItemId } from "$lib/types/tracker-data.js";

describe("source accumulators", () => {
  it("keeps item and cosmetic target namespaces independent", () => {
    const items = new ItemSourceAccumulator();
    const cosmetics = new CosmeticSourceAccumulator();

    items.add("shared_id" as ItemId, { type: "default" });
    cosmetics.add("shared_id" as CosmeticId, { type: "renown", level: 20 });

    expect(items.toRecord()).toEqual({ shared_id: [{ type: "default" }] });
    expect(cosmetics.toRecord()).toEqual({ shared_id: [{ type: "renown", level: 20 }] });
  });

  it("sorts target IDs and sources by canonical JSON", () => {
    const sources = new ItemSourceAccumulator();

    sources.add("z_item" as ItemId, { type: "default" });
    sources.add("a_item" as ItemId, { type: "store", storeId: "z_store" as never });
    sources.add("a_item" as ItemId, { type: "renown", level: 5 });

    expect(sources.toRecord()).toEqual({
      a_item: [
        { type: "renown", level: 5 },
        { type: "store", storeId: "z_store" },
      ],
      z_item: [{ type: "default" }],
    });
  });

  it("preserves the first identical source while identity includes acquisition details", () => {
    const sources = new ItemSourceAccumulator();
    const targetId = "item" as ItemId;
    const first: Source = {
      type: "store",
      availability: { type: "season", seasons: ["spring"] },
      cost: { amount: 10, currency: "tesserae" },
      storeId: "general" as never,
      visibility: { type: "questCompleted", questId: "first" as never },
      weight: 2,
    };

    sources.add(targetId, first);
    sources.add(targetId, {
      ...first,
      visibility: { type: "questCompleted", questId: "second" as never },
    });
    sources.add(targetId, { ...first, cost: { amount: 11, currency: "tesserae" } });
    sources.add(targetId, {
      ...first,
      availability: { type: "season", seasons: ["summer"] },
    });
    sources.add(targetId, { ...first, weight: 3 });

    const accumulated = sources.get(targetId);
    expect(accumulated).toHaveLength(4);
    expect(accumulated).toContain(first);
    expect(accumulated).not.toContainEqual({
      ...first,
      visibility: { type: "questCompleted", questId: "second" },
    });
  });
});
