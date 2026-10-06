import type { Source } from "#lib/types/acquisition.js";
import type { RecipeId } from "#lib/types/tracker-data.js";

import type { PipelineDiagnostics } from "../diagnostics.js";
import type { RecipeSourceAccumulator } from "./source-accumulator.js";

export interface RecipeAcquisitionContext {
  diagnostics: PipelineDiagnostics;
  knownRecipeIds: Set<string>;
  recipeIdByItemId: Map<string, RecipeId>;
  sources: RecipeSourceAccumulator;
}

export function resolveRecipeTarget(
  target: string,
  context: RecipeAcquisitionContext,
  sourcePath: string,
): RecipeId | undefined {
  const recipeId = context.recipeIdByItemId.get(target);
  if (recipeId) return recipeId;
  if (context.knownRecipeIds.has(target)) return target as RecipeId;
  context.diagnostics.add({
    fieldPath: sourcePath,
    kind: "unresolved-scroll-target",
    message: `scroll target "${target}" in ${sourcePath} has no matching item`,
    targetId: target,
  });
  return undefined;
}

export function addRecipeScrollSource(
  target: string,
  source: Source,
  context: RecipeAcquisitionContext,
  sourcePath: string,
): void {
  const recipeId = resolveRecipeTarget(target, context, sourcePath);
  if (recipeId) context.sources.add(recipeId, source);
}
