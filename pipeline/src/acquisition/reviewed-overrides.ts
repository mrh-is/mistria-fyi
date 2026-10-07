import { recordEntries } from "#lib/utils/record.js";

import {
  COSMETIC_OVERRIDES,
  getItemOverrides,
  ITEM_SOURCE_REPLACEMENTS,
} from "../overrides/sources.js";
import { canonicalSourceJson } from "./source-accumulator.js";

import type { Source } from "#lib/types/acquisition.js";
import type { CosmeticId, ItemId } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse/parse-fiddle.js";
import type { CosmeticSourceAccumulator, ItemSourceAccumulator } from "./source-accumulator.js";

export interface OverrideDiagnostic {
  kind: "missing-target" | "obsolete-override";
  message: string;
  namespace: "cosmetics" | "items";
  targetId: string;
}

/** Hand-reviewed sources for acquisition paths the native data doesn't encode. */
export interface ReviewedOverrides {
  cosmetics: Partial<Record<CosmeticId, Source[]>>;
  itemReplacements: Partial<Record<ItemId, Source[]>>;
  items: Partial<Record<ItemId, Source[]>>;
}

/** The reviewed overrides for the installed game version. */
export function getReviewedOverrides(fiddle: ParsedGameData): ReviewedOverrides {
  const misc = fiddle.misc as Record<string, unknown> | undefined;
  const well = misc?.wishing_well as Record<string, unknown> | undefined;
  const price = well?.low_price;
  if (typeof price !== "number" || !Number.isFinite(price)) {
    throw new TypeError("Missing native misc.wishing_well.low_price for reviewed rewards");
  }
  return {
    cosmetics: COSMETIC_OVERRIDES,
    itemReplacements: ITEM_SOURCE_REPLACEMENTS,
    items: getItemOverrides(price),
  };
}

export function applyReviewedOverrides(
  items: Readonly<Record<string, unknown>>,
  cosmetics: Readonly<Record<string, unknown>>,
  itemAccumulator: ItemSourceAccumulator,
  cosmeticAccumulator: CosmeticSourceAccumulator,
  overrides: ReviewedOverrides,
): OverrideDiagnostic[] {
  const diagnostics: OverrideDiagnostic[] = [];

  for (const [targetId, sources] of recordEntries(overrides.items)) {
    if (!(targetId in items)) {
      diagnostics.push({
        kind: "missing-target",
        message: `reviewed item override target "${targetId}" not found in item registry`,
        namespace: "items",
        targetId,
      });
      continue;
    }

    for (const source of sources) {
      const identity = canonicalSourceJson(source);
      const existing = itemAccumulator.get(targetId);
      if (existing.some((s) => canonicalSourceJson(s) === identity)) {
        diagnostics.push({
          kind: "obsolete-override",
          message: `reviewed item override for "${targetId}" matches an existing native source — remove the override`,
          namespace: "items",
          targetId,
        });
        continue;
      }
      itemAccumulator.add(targetId, source, {
        fieldPath: `reviewed-overrides.items.${targetId}`,
        sourcePath: "pipeline/src/overrides/sources.ts",
      });
    }
  }

  for (const [targetId, sources] of recordEntries(overrides.itemReplacements)) {
    if (!(targetId in items)) {
      diagnostics.push({
        kind: "missing-target",
        message: `reviewed item replacement target "${targetId}" not found in item registry`,
        namespace: "items",
        targetId,
      });
      continue;
    }

    const native = itemAccumulator.get(targetId);
    if (
      sources.length === native.length &&
      sources.every((source) =>
        native.some((existing) => canonicalSourceJson(existing) === canonicalSourceJson(source)),
      )
    ) {
      diagnostics.push({
        kind: "obsolete-override",
        message: `reviewed item replacement for "${targetId}" now matches native sources`,
        namespace: "items",
        targetId,
      });
      continue;
    }
    itemAccumulator.replace(targetId, sources, {
      fieldPath: `reviewed-overrides.items.${targetId}`,
      sourcePath: "pipeline/src/overrides/sources.ts",
    });
  }

  for (const [targetId, sources] of recordEntries(overrides.cosmetics)) {
    if (!(targetId in cosmetics)) {
      diagnostics.push({
        kind: "missing-target",
        message: `reviewed cosmetic override target "${targetId}" not found in cosmetic registry`,
        namespace: "cosmetics",
        targetId,
      });
      continue;
    }

    for (const source of sources) {
      const identity = canonicalSourceJson(source);
      const existing = cosmeticAccumulator.get(targetId);
      if (existing.some((s) => canonicalSourceJson(s) === identity)) {
        diagnostics.push({
          kind: "obsolete-override",
          message: `reviewed cosmetic override for "${targetId}" matches an existing native source — remove the override`,
          namespace: "cosmetics",
          targetId,
        });
        continue;
      }
      cosmeticAccumulator.add(targetId, source, {
        fieldPath: `reviewed-overrides.cosmetics.${targetId}`,
        sourcePath: "pipeline/src/overrides/sources.ts",
      });
    }
  }

  return diagnostics;
}

const DEFAULT_SOURCE: Source = { type: "default" };

export function collectDefaultCosmeticSources(
  cosmetics: Readonly<Record<CosmeticId, { readonly sources: readonly Source[] }>>,
  accumulator: CosmeticSourceAccumulator,
): void {
  for (const [id, cosmetic] of recordEntries(cosmetics)) {
    if (cosmetic.sources.some((src) => src.type === "default")) {
      accumulator.add(id, DEFAULT_SOURCE, {
        fieldPath: `cosmetics.${id}.default_unlocked`,
        sourcePath: "player_assets.toml",
      });
    }
  }
}

// misc.ari_stats.starting_inventory and misc.ari_stats.starting_armor provide evidence that
// these items are available from the start of the game.
export function collectDefaultItemSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  items: Readonly<Record<string, unknown>>,
): void {
  const misc = fiddle.misc as Record<string, unknown> | undefined;
  const ariStats = misc?.ari_stats as Record<string, unknown> | undefined;

  const startingInventory = ariStats?.starting_inventory;
  if (Array.isArray(startingInventory)) {
    for (const itemId of startingInventory) {
      if (typeof itemId === "string" && itemId in items) {
        accumulator.add(itemId as ItemId, DEFAULT_SOURCE, {
          fieldPath: `misc.ari_stats.starting_inventory`,
          sourcePath: "misc.toml",
        });
      }
    }
  }

  const startingArmor = ariStats?.starting_armor as Record<string, string> | undefined;
  if (startingArmor) {
    for (const [slot, itemId] of Object.entries(startingArmor)) {
      if (typeof itemId === "string" && itemId in items) {
        accumulator.add(itemId as ItemId, DEFAULT_SOURCE, {
          fieldPath: `misc.ari_stats.starting_armor.${slot}`,
          sourcePath: "misc.toml",
        });
      }
    }
  }
}

export {
  COSMETIC_OVERRIDES,
  getItemOverrides,
  ITEM_SOURCE_REPLACEMENTS,
} from "../overrides/sources.js";
