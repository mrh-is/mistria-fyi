import type { SourceFieldLocation } from "./data-shapes.js";

/**
 * Requirements normalize into an expression tree. Missing, null, and empty objects become
 * `{ all: [] }`, an unconstrained true expression. Sibling keys imply `all`; an `or` array
 * implies `any`; and `invert` implies `not`. A single-object `or` parses directly rather than
 * gaining a redundant `any` wrapper.
 */
export type RequirementExpression =
  | { all: RequirementExpression[] }
  | { any: RequirementExpression[] }
  | { not: RequirementExpression }
  | { predicate: string; value: unknown };

/**
 * Empty top-level definition tables identify primitive predicate names; nonempty tables identify
 * named definitions.
 */
export type NamedRequirementDefinitions = Record<string, Record<string, unknown>>;

export interface RequirementDefinitions {
  namedRequirements: NamedRequirementDefinitions;
  primitivePredicates: Set<string>;
}

type ResolutionState = "resolved" | "unvisited" | "visiting";

interface RequirementResolutionContext {
  cache: Map<string, RequirementExpression>;
  namedRequirements: NamedRequirementDefinitions;
  primitivePredicates: Set<string>;
  resolutionStateByName: Map<string, ResolutionState>;
}

export function buildRequirementDefinitions(
  requirementsData: Record<string, unknown>,
): RequirementDefinitions {
  const primitivePredicates = new Set<string>();
  const namedRequirements: NamedRequirementDefinitions = {};

  for (const [key, value] of Object.entries(requirementsData)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const body = value as Record<string, unknown>;
    if (Object.keys(body).length === 0) {
      primitivePredicates.add(key);
    } else {
      namedRequirements[key] = body;
    }
  }

  return { namedRequirements, primitivePredicates };
}

export function parseRequirements(
  value: unknown,
  namedRequirements: NamedRequirementDefinitions,
  primitivePredicates: Set<string>,
  context: SourceFieldLocation,
): RequirementExpression {
  if (value === undefined || value === null) return { all: [] };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Expected requirements object for ${context.entityId ?? context.fieldPath} in ${context.sourcePath}, got ${typeof value}`,
    );
  }

  const obj = value as Record<string, unknown>;
  const requirementResolutionContext: RequirementResolutionContext = {
    cache: new Map(),
    namedRequirements,
    primitivePredicates,
    resolutionStateByName: new Map(),
  };

  return parseRequirementObject(obj, requirementResolutionContext, context, []);
}

/**
 * Named references must be literal `true`, are expanded recursively, are memoized, and report
 * cycles. Unknown keys deliberately remain predicate leaves for forward compatibility; this
 * layer does not schema-validate primitive payloads.
 */
function parseRequirementObject(
  obj: Record<string, unknown>,
  requirementResolutionContext: RequirementResolutionContext,
  context: SourceFieldLocation,
  namedRequirementStack: string[],
): RequirementExpression {
  const entries = Object.entries(obj);
  if (entries.length === 0) return { all: [] };

  const conjuncts: RequirementExpression[] = [];

  for (const [key, val] of entries) {
    if (key === "or") {
      conjuncts.push(parseOr(val, requirementResolutionContext, context, namedRequirementStack));
    } else if (key === "invert") {
      conjuncts.push(
        parseInvert(val, requirementResolutionContext, context, namedRequirementStack),
      );
    } else if (requirementResolutionContext.primitivePredicates.has(key)) {
      conjuncts.push({ predicate: key, value: val });
    } else if (key in requirementResolutionContext.namedRequirements) {
      if (val === true) {
        conjuncts.push(
          resolveNamed(key, requirementResolutionContext, context, namedRequirementStack),
        );
      } else {
        throw new Error(
          `Named requirement "${key}" must be true (boolean), got ${typeof val} in ${context.sourcePath}`,
        );
      }
    } else {
      // Dotted key might be a predicate with nested value (e.g., reached_skill_level.ranching = 20)
      // or an unknown name — treat as predicate if its name follows predicate patterns
      conjuncts.push({ predicate: key, value: val });
    }
  }

  return conjuncts.length === 1 ? conjuncts[0] : { all: conjuncts };
}

function parseOr(
  val: unknown,
  requirementResolutionContext: RequirementResolutionContext,
  context: SourceFieldLocation,
  namedRequirementStack: string[],
): RequirementExpression {
  if (Array.isArray(val)) {
    const alternatives: RequirementExpression[] = val.map((entry) => {
      if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
        return parseRequirementObject(
          entry as Record<string, unknown>,
          requirementResolutionContext,
          context,
          namedRequirementStack,
        );
      }
      throw new Error(`Expected object in or-array in ${context.sourcePath}, got ${typeof entry}`);
    });
    return { any: alternatives };
  }
  if (typeof val === "object" && val !== null) {
    // Single-entry or (e.g., or = { ... })
    return parseRequirementObject(
      val as Record<string, unknown>,
      requirementResolutionContext,
      context,
      namedRequirementStack,
    );
  }
  throw new Error(`Expected array or object for "or" in ${context.sourcePath}, got ${typeof val}`);
}

function parseInvert(
  val: unknown,
  requirementResolutionContext: RequirementResolutionContext,
  context: SourceFieldLocation,
  namedRequirementStack: string[],
): RequirementExpression {
  if (typeof val !== "object" || val === null || Array.isArray(val)) {
    throw new Error(`Expected object for "invert" in ${context.sourcePath}, got ${typeof val}`);
  }
  const inner = parseRequirementObject(
    val as Record<string, unknown>,
    requirementResolutionContext,
    context,
    namedRequirementStack,
  );
  return { not: inner };
}

function resolveNamed(
  name: string,
  requirementResolutionContext: RequirementResolutionContext,
  context: SourceFieldLocation,
  namedRequirementStack: string[],
): RequirementExpression {
  const cached = requirementResolutionContext.cache.get(name);
  if (cached) return cached;

  const currentState = requirementResolutionContext.resolutionStateByName.get(name) ?? "unvisited";
  if (currentState === "visiting") {
    const cycle = [...namedRequirementStack, name].join(" -> ");
    throw new Error(`Requirement cycle: ${cycle} in ${context.sourcePath}`);
  }

  const body = requirementResolutionContext.namedRequirements[name];
  if (!body) {
    throw new Error(
      `Unknown requirement "${name}" referenced by ${context.entityId ?? context.fieldPath} in ${context.sourcePath}`,
    );
  }

  requirementResolutionContext.resolutionStateByName.set(name, "visiting");
  const newStack = [...namedRequirementStack, name];
  const resolved = parseRequirementObject(body, requirementResolutionContext, context, newStack);
  requirementResolutionContext.resolutionStateByName.set(name, "resolved");
  requirementResolutionContext.cache.set(name, resolved);
  return resolved;
}
