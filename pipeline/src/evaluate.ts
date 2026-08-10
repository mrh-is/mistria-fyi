import { sourceFileFor, type FiddleData } from "./parse-fiddle.js";

type ResolutionState = "resolved" | "visiting";
type ValueField = "bin" | "store";

interface EvaluationContext {
  allItems: Map<string, Record<string, unknown>>;
  fiddle: FiddleData;
  itemRoots: Map<string, string>;
  stack: string[];
  valueStates: Map<string, ResolutionState>;
}

export function evaluateExpressions(fiddle: FiddleData): void {
  const itemsRoot = fiddle.items as
    | Record<string, Record<string, Record<string, Record<string, unknown>>>>
    | undefined;
  if (!itemsRoot) return;

  const allItems = new Map<string, Record<string, unknown>>();
  const itemRoots = new Map<string, string>();
  for (const [categoryId, subCategories] of Object.entries(itemsRoot)) {
    for (const [fileId, categoryItems] of Object.entries(subCategories)) {
      const itemRoot = `items.${categoryId}.${fileId}`;
      const sourceFile = sourceFileFor(fiddle, itemRoot);
      for (const [itemId, item] of Object.entries(categoryItems)) {
        if (typeof item === "object" && item !== null) {
          const priorRoot = itemRoots.get(itemId);
          if (priorRoot) {
            throw new Error(
              `Duplicate item ID "${itemId}" in ${sourceFile} and ${sourceFileFor(fiddle, priorRoot)}`,
            );
          }
          allItems.set(itemId, item as Record<string, unknown>);
          itemRoots.set(itemId, itemRoot);
        }
      }
    }
  }

  const context: EvaluationContext = {
    allItems,
    fiddle,
    itemRoots,
    stack: [],
    valueStates: new Map(),
  };
  let resolved = 0;

  for (const [itemId, item] of allItems) {
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
  for (const [itemId, item] of allItems) {
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

function resolveExpression(
  expr: string,
  itemId: string,
  item: Record<string, unknown>,
  context: EvaluationContext,
): number {
  // Pattern 1: self.recipe * <multiplier>
  const selfRecipeMatch = /^self\.recipe\s*\*\s*([\d.]+)$/.exec(expr);
  if (selfRecipeMatch) {
    const multiplier = parseFloat(selfRecipeMatch[1]);
    const recipeCost = calculateRecipeCost(itemId, item, context);
    return Math.round(recipeCost * multiplier);
  }

  // Pattern 2: <item_id>.store * <count>
  const refStoreMatch = /^(\w+)\.store\s*\*\s*(\d+)$/.exec(expr);
  if (refStoreMatch) {
    const refId = refStoreMatch[1];
    const count = parseInt(refStoreMatch[2], 10);
    const storeVal = resolveValueField(refId, "store", context, itemId);
    if (typeof storeVal !== "number") {
      throw itemError(
        context,
        itemId,
        `Expression "${expr}" on item "${itemId}": "${refId}.store" is not a number (got ${typeof storeVal})`,
      );
    }
    return storeVal * count;
  }

  throw itemError(context, itemId, `Unknown expression pattern "${expr}" on item "${itemId}"`);
}

function resolveValueField(
  itemId: string,
  field: ValueField,
  context: EvaluationContext,
  requesterId = itemId,
): number | undefined {
  const item = context.allItems.get(itemId);
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
  if (context.valueStates.get(key) === "visiting") {
    throw itemError(context, itemId, `Value cycle: ${[...context.stack, key].join(" -> ")}`);
  }
  context.valueStates.set(key, "visiting");
  context.stack.push(key);
  const resolved = resolveExpression(raw, itemId, item, context);
  context.stack.pop();
  context.valueStates.set(key, "resolved");
  value[field] = resolved;
  return resolved;
}

function calculateRecipeCost(
  itemId: string,
  item: Record<string, unknown>,
  context: EvaluationContext,
): number {
  const recipe = item.recipe;
  if (!Array.isArray(recipe)) {
    throw itemError(context, itemId, `Item "${itemId}" has self.recipe value but no recipe array`);
  }

  let total = 0;
  for (const ingredient of recipe) {
    if (typeof ingredient !== "object" || ingredient === null) {
      throw itemError(context, itemId, `Malformed recipe entry on item "${itemId}"`);
    }
    const ing = ingredient as Record<string, unknown>;
    const ingItemId = ing.item as string | undefined;
    if (!ingItemId) {
      // Skip non-item recipe costs (time, essence)
      if (typeof ing.hours === "number" || typeof ing.essence === "number") continue;
      throw itemError(context, itemId, `Malformed recipe entry on item "${itemId}"`);
    }
    if (ing.count !== undefined && (typeof ing.count !== "number" || ing.count <= 0)) {
      throw itemError(
        context,
        itemId,
        `Recipe for "${itemId}" has invalid count for "${ingItemId}"`,
      );
    }
    const count = (ing.count as number | undefined) ?? 1;

    const ingItem = context.allItems.get(ingItemId);
    if (!ingItem) {
      throw itemError(
        context,
        itemId,
        `Recipe for "${itemId}" references missing item "${ingItemId}"`,
      );
    }

    let ingredientValue = resolveValueField(ingItemId, "bin", context, itemId);
    ingredientValue ??= resolveValueField(ingItemId, "store", context, itemId);
    if (typeof ingredientValue !== "number") {
      throw itemError(
        context,
        itemId,
        `Recipe for "${itemId}" uses "${ingItemId}", which has neither numeric bin nor store value`,
      );
    }
    total += ingredientValue * count;
  }

  return total;
}

function itemError(context: EvaluationContext, itemId: string, message: string): Error {
  const itemRoot = context.itemRoots.get(itemId);
  if (!itemRoot) return new Error(message);
  return new Error(`${message} in ${sourceFileFor(context.fiddle, itemRoot)}`);
}
