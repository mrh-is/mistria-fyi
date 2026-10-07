import type { Source } from "#lib/types/acquisition.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

/** Extraction metadata, consumed by enrichment before the public Source contract is emitted. */
export type PipelineSource = Source & { stockGate?: VisibilityCondition };

/** Fail before publishing if any internal stock gate escaped enrichment. */
export function assertNoStockGates(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  if (Object.hasOwn(value, "stockGate")) {
    throw new Error("Internal stockGate escaped acquisition enrichment");
  }
  for (const child of Object.values(value)) assertNoStockGates(child);
}
