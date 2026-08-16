import { describe, expect, it } from "vitest";

import { CosmeticSourceAccumulator, ItemSourceAccumulator } from "./source-accumulator.js";

import type { Source } from "$lib/types/acquisition.js";
import type { CosmeticId, ItemId } from "$lib/types/tracker-data.js";

describe("source accumulators", () => {
  it("keeps item and cosmetic target namespaces independent", () => {
    const items = new ItemSourceAccumulator();
    const cosmetics = new CosmeticSourceAccumulator();

    items.add("shared_id" as ItemId, { type: "default" });
    cosmetics.add("shared_id" as CosmeticId, { level: 20, type: "renown" });

    expect(items.toRecord()).toEqual({ shared_id: [{ type: "default" }] });
    expect(cosmetics.toRecord()).toEqual({ shared_id: [{ level: 20, type: "renown" }] });
  });

  it("sorts target IDs and sources by canonical JSON", () => {
    const sources = new ItemSourceAccumulator();

    sources.add("z_item" as ItemId, { type: "default" });
    sources.add("a_item" as ItemId, { storeId: "z_store" as never, type: "store" });
    sources.add("a_item" as ItemId, { level: 5, type: "renown" });

    expect(sources.toRecord()).toEqual({
      a_item: [
        { level: 5, type: "renown" },
        { storeId: "z_store", type: "store" },
      ],
      z_item: [{ type: "default" }],
    });
  });

  it("preserves the first identical source while identity includes acquisition details", () => {
    const sources = new ItemSourceAccumulator();
    const targetId = "item" as ItemId;
    const first: Source = {
      availability: { seasons: ["spring"], type: "season" },
      chance: 0.25,
      cost: { amount: 10, currency: "tesserae" },
      storeId: "general" as never,
      type: "store",
      visibility: { questId: "first" as never, type: "questCompleted" },
      weight: 2,
    };

    sources.add(targetId, first);
    sources.add(targetId, {
      ...first,
      visibility: { questId: "second" as never, type: "questCompleted" },
    });
    sources.add(targetId, { ...first, chance: 0.5 });
    sources.add(targetId, { ...first, cost: { amount: 11, currency: "tesserae" } });
    sources.add(targetId, {
      ...first,
      availability: { seasons: ["summer"], type: "season" },
    });
    sources.add(targetId, { ...first, weight: 3 });

    const accumulated = sources.get(targetId);
    expect(accumulated).toHaveLength(5);
    expect(accumulated).toContain(first);
    expect(accumulated).not.toContainEqual({
      ...first,
      visibility: { questId: "second", type: "questCompleted" },
    });
  });
});
