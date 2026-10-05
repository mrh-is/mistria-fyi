import { sourceFileFor } from "./parse-fiddle.js";

import type { ParsedGameData } from "./parse-fiddle.js";

type ResolutionState = "resolved" | "visiting";
type ResolvableValueField = "bin" | "store";

interface ValueEvaluationContext {
  dependencyPathStack: string[];
  fiddle: ParsedGameData;
  itemRootPathById: Map<string, string>;
  itemsById: Map<string, Record<string, unknown>>;
  resolutionStateByValuePath: Map<string, ResolutionState>;
}

/**
 * Resolves supported item value expressions by mutating the parsed tree in place.
 * Item IDs must be globally unique across item TOML files. Only `self.recipe * N` and
 * `<item_id>.store * N` inline forms are supported. An absent state-map entry means
 * unvisited; revisiting `visiting` reports a dependency cycle. Every claimed string
 * `bin` or `store` value must become numeric before extraction.
 */
export function evaluateExpressions(fiddle: ParsedGameData): void {
  const itemsRoot = fiddle.items as
    | Record<string, Record<string, Record<string, Record<string, unknown>>>>
    | undefined;
  if (!itemsRoot) return;

  const itemsById = new Map<string, Record<string, unknown>>();
  const itemRootPathById = new Map<string, string>();
  for (const [categoryId, categoryFiles] of Object.entries(itemsRoot)) {
    for (const [fileStem, itemsInFile] of Object.entries(categoryFiles)) {
      const itemRoot = `items.${categoryId}.${fileStem}`;
      const sourceFile = sourceFileFor(fiddle, itemRoot);
      for (const [itemId, item] of Object.entries(itemsInFile)) {
        if (typeof item === "object" && item !== null) {
          const priorRoot = itemRootPathById.get(itemId);
          if (priorRoot) {
            throw new Error(
              `Duplicate item ID "${itemId}" in ${sourceFile} and ${sourceFileFor(fiddle, priorRoot)}`,
            );
          }
          itemsById.set(itemId, item);
          itemRootPathById.set(itemId, itemRoot);
        }
      }
    }
  }

  const context: ValueEvaluationContext = {
    dependencyPathStack: [],
    fiddle,
    itemRootPathById,
    itemsById,
    resolutionStateByValuePath: new Map(),
  };
  let resolved = 0;

  for (const [itemId, item] of itemsById) {
    const value = item.value as Record<string, unknown> | undefined;
    if (typeof value?.bin === "string") {
      resolveValueField(itemId, "bin", context);
      resolved++;
    }
    if (typeof value?.store === "string") {
      resolveValueField(itemId, "store", context);
      resolved++;
    }
  }

  // Enforce complete resolution: no string expressions should remain
  for (const [itemId, item] of itemsById) {
    const value = item.value as Record<string, unknown> | undefined;
    if (!value) continue;
    for (const field of ["bin", "store"] as const) {
      if (typeof value[field] === "string") {
        throw itemError(
          context,
          itemId,
          `Unresolved expression "${value[field]}" on "${itemId}.value.${field}"`,
        );
      }
    }
  }

  console.log(`  Expressions: ${resolved} values resolved`);
}

function calculateRecipeCost(
  itemId: string,
  item: Record<string, unknown>,
  context: ValueEvaluationContext,
): number {
  const recipe = item.recipe;
  if (!Array.isArray(recipe)) {
    throw itemError(context, itemId, `Item "${itemId}" has self.recipe value but no recipe array`);
  }

  let total = 0;
  // Recipe costs ignore numeric `hours` and `essence` entries, default missing counts to one,
  // reject invalid counts, prefer `bin`, fall back to `store`, and preserve zero as valid.
  for (const ingredient of recipe) {
    if (typeof ingredient !== "object" || ingredient === null) {
      throw itemError(context, itemId, `Malformed recipe entry on item "${itemId}"`);
    }
    const ingredientData = ingredient as Record<string, unknown>;
    const ingredientItemId = ingredientData.item as string | undefined;
    if (!ingredientItemId) {
      // Skip non-item recipe costs (time, essence)
      if (typeof ingredientData.hours === "number" || typeof ingredientData.essence === "number") {
        continue;
      }
      throw itemError(context, itemId, `Malformed recipe entry on item "${itemId}"`);
    }
    if (
      ingredientData.count !== undefined &&
      (typeof ingredientData.count !== "number" || ingredientData.count <= 0)
    ) {
      throw itemError(
        context,
        itemId,
        `Recipe for "${itemId}" has invalid count for "${ingredientItemId}"`,
      );
    }
    const count = ingredientData.count ?? 1;

    const ingredientItem = context.itemsById.get(ingredientItemId);
    if (!ingredientItem) {
      throw itemError(
        context,
        itemId,
        `Recipe for "${itemId}" references missing item "${ingredientItemId}"`,
      );
    }

    let ingredientValue = resolveValueField(ingredientItemId, "bin", context, itemId);
    ingredientValue ??= resolveValueField(ingredientItemId, "store", context, itemId);
    if (typeof ingredientValue !== "number") {
      throw itemError(
        context,
        itemId,
        `Recipe for "${itemId}" uses "${ingredientItemId}", which has neither numeric bin nor store value`,
      );
    }
    total += ingredientValue * count;
  }

  return total;
}

function itemError(context: ValueEvaluationContext, itemId: string, message: string): Error {
  const itemRoot = context.itemRootPathById.get(itemId);
  if (!itemRoot) return new Error(message);
  return new Error(`${message} in ${sourceFileFor(context.fiddle, itemRoot)}`);
}

function resolveExpression(
  expression: string,
  itemId: string,
  item: Record<string, unknown>,
  context: ValueEvaluationContext,
): number {
  // Supported inline forms are `self.recipe * N`, which resolves recipe cost, and
  // `<item_id>.store * N`, which multiplies a referenced store value. No other forms are
  // accepted.
  const selfRecipeMatch = /^self\.recipe\s*\*\s*(\d+(?:\.\d+)?)$/.exec(expression);
  if (selfRecipeMatch) {
    const multiplier = Number(selfRecipeMatch[1]);
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw itemError(
        context,
        itemId,
        `Invalid recipe multiplier "${selfRecipeMatch[1]}" in expression "${expression}" on item "${itemId}"`,
      );
    }
    const recipeCost = calculateRecipeCost(itemId, item, context);
    return Math.round(recipeCost * multiplier);
  }

  const refStoreMatch = /^(\w+)\.store\s*\*\s*(\d+)$/.exec(expression);
  if (refStoreMatch) {
    const referencedItemId = refStoreMatch[1];
    const count = Math.trunc(Number(refStoreMatch[2]));
    const referencedStoreValue = resolveValueField(referencedItemId, "store", context, itemId);
    if (typeof referencedStoreValue !== "number") {
      throw itemError(
        context,
        itemId,
        `Expression "${expression}" on item "${itemId}": "${referencedItemId}.store" is not a number (got ${typeof referencedStoreValue})`,
      );
    }
    return referencedStoreValue * count;
  }

  throw itemError(
    context,
    itemId,
    `Unknown expression pattern "${expression}" on item "${itemId}"`,
  );
}

function resolveValueField(
  itemId: string,
  field: ResolvableValueField,
  context: ValueEvaluationContext,
  requesterId = itemId,
): number | undefined {
  const item = context.itemsById.get(itemId);
  if (!item) {
    throw itemError(context, requesterId, `Value dependency references missing item "${itemId}"`);
  }
  const value = item.value as Record<string, unknown> | undefined;
  if (!value) return undefined;
  const raw = value[field];
  if (raw === undefined) return undefined;
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") {
    throw itemError(
      context,
      itemId,
      `Item "${itemId}" value.${field} must be a number or expression`,
    );
  }

  const key = `${itemId}.value.${field}`;
  if (context.resolutionStateByValuePath.get(key) === "visiting") {
    throw itemError(
      context,
      itemId,
      `Value cycle: ${[...context.dependencyPathStack, key].join(" -> ")}`,
    );
  }
  context.resolutionStateByValuePath.set(key, "visiting");
  context.dependencyPathStack.push(key);
  const resolved = resolveExpression(raw, itemId, item, context);
  context.dependencyPathStack.pop();
  context.resolutionStateByValuePath.set(key, "resolved");
  value[field] = resolved;
  return resolved;
}
