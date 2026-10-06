import type { ReviewedPipelineDiagnostic } from "./diagnostics.js";

/** Exact exceptions observed in the installed 1.0.5 structured assets; no wildcard suppression. */
export const REVIEWED_PIPELINE_DIAGNOSTICS: readonly ReviewedPipelineDiagnostic[] = [
  {
    evidence:
      "Game 1.0.5 fiddle/items/other/materials.toml [void_herb] has forageable & mines_forageable tags outside the mines item namespace. acquisition/reviewed-overrides.ts ITEM_OVERRIDES.void_herb supplies a Mines forage source gated by Find the Magic Key, as previously reviewed by the project owner.",
    fieldPath: "items.other.materials.void_herb",
    kind: "biome-less-forageable",
    message: 'mines_forageable "void_herb" has no biome mapping (other/materials)',
    reason:
      "Void Herb grows throughout the Mines, rather than in one category-specific biome; the reviewed acquisition override supplies its source.",
    targetId: "void_herb",
  },
];
