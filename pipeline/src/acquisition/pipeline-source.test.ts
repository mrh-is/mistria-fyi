import { describe, expect, it } from "vitest";

import { assertNoStockGates } from "./pipeline-source.js";
import { RecipeSourceAccumulator } from "./source-accumulator.js";

import type { RecipeId } from "#lib/types/tracker-data.js";

import type { PipelineSource } from "./pipeline-source.js";

const gate = { type: "questCompleted", questId: "repair_the_bridge" as never } as const;

describe("pipeline source metadata", () => {
  it("retains distinct stock gates & does not conflate them with final visibility", () => {
    const sources = new RecipeSourceAccumulator();
    const id = "dish" as RecipeId;
    const source: PipelineSource = { type: "store", stockGate: gate, storeId: "general" as never };
    sources.add(id, source);
    sources.add(id, { ...source });
    sources.add(id, { ...source, stockGate: { ...gate, questId: "another" as never } });
    sources.add(id, { type: "store", storeId: "general" as never, visibility: gate });
    expect(sources.get(id)).toHaveLength(3);
    expect(sources.get(id).filter((entry) => entry.stockGate)).toHaveLength(2);
  });

  it("rejects metadata leaks anywhere in the emitted data", () => {
    expect(() => {
      assertNoStockGates({ recipes: { dish: { sources: [{ stockGate: gate }] } } });
    }).toThrow("stockGate");
    expect(() => {
      assertNoStockGates({ name: "Dish", sources: [{ visibility: gate }] });
    }).not.toThrow();
  });
});
