import type { DataContext } from "./data-shapes.js";

export type RequirementExpr =
  | { all: RequirementExpr[] }
  | { any: RequirementExpr[] }
  | { not: RequirementExpr }
  | { predicate: string; value: unknown };

export type RequirementRegistry = Record<string, Record<string, unknown>>;

type ResolutionState = "resolved" | "unvisited" | "visiting";

interface ResolverState {
  cache: Map<string, RequirementExpr>;
  primitives: Set<string>;
  registry: RequirementRegistry;
  states: Map<string, ResolutionState>;
}

export function buildRequirementRegistry(
  requirementsData: Record<string, unknown>,
): { named: RequirementRegistry; primitives: Set<string> } {
  const primitives = new Set<string>();
  const named: RequirementRegistry = {};

  for (const [key, value] of Object.entries(requirementsData)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const body = value as Record<string, unknown>;
    if (Object.keys(body).length === 0) {
      primitives.add(key);
    } else {
      named[key] = body;
    }
  }

  return { named, primitives };
}

export function parseRequirements(
  value: unknown,
  registry: RequirementRegistry,
  primitives: Set<string>,
  context: DataContext,
): RequirementExpr {
  if (value === undefined || value === null) return { all: [] };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Expected requirements object for ${context.entity ?? context.field} in ${context.sourceFile}, got ${typeof value}`,
    );
  }

  const obj = value as Record<string, unknown>;
  const state: ResolverState = {
    cache: new Map(),
    primitives,
    registry,
    states: new Map(),
  };

  return parseRequirementObject(obj, state, context, []);
}

function parseRequirementObject(
  obj: Record<string, unknown>,
  state: ResolverState,
  context: DataContext,
  nameStack: string[],
): RequirementExpr {
  const entries = Object.entries(obj);
  if (entries.length === 0) return { all: [] };

  const parts: RequirementExpr[] = [];

  for (const [key, val] of entries) {
    if (key === "or") {
      parts.push(parseOr(val, state, context, nameStack));
    } else if (key === "invert") {
      parts.push(parseInvert(val, state, context, nameStack));
    } else if (state.primitives.has(key)) {
      parts.push({ predicate: key, value: val });
    } else if (key in state.registry) {
      if (val === true) {
        parts.push(resolveNamed(key, state, context, nameStack));
      } else {
        throw new Error(
          `Named requirement "${key}" must be true (boolean), got ${typeof val} in ${context.sourceFile}`,
        );
      }
    } else {
      // Dotted key might be a predicate with nested value (e.g., reached_skill_level.ranching = 20)
      // or an unknown name — treat as predicate if its name follows predicate patterns
      parts.push({ predicate: key, value: val });
    }
  }

  return parts.length === 1 ? parts[0] : { all: parts };
}

function parseOr(
  val: unknown,
  state: ResolverState,
  context: DataContext,
  nameStack: string[],
): RequirementExpr {
  if (Array.isArray(val)) {
    const alternatives: RequirementExpr[] = val.map((entry) => {
      if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
        return parseRequirementObject(entry as Record<string, unknown>, state, context, nameStack);
      }
      throw new Error(`Expected object in or-array in ${context.sourceFile}, got ${typeof entry}`);
    });
    return { any: alternatives };
  }
  if (typeof val === "object" && val !== null) {
    // Single-entry or (e.g., or = { ... })
    return parseRequirementObject(val as Record<string, unknown>, state, context, nameStack);
  }
  throw new Error(`Expected array or object for "or" in ${context.sourceFile}, got ${typeof val}`);
}

function parseInvert(
  val: unknown,
  state: ResolverState,
  context: DataContext,
  nameStack: string[],
): RequirementExpr {
  if (typeof val !== "object" || val === null || Array.isArray(val)) {
    throw new Error(
      `Expected object for "invert" in ${context.sourceFile}, got ${typeof val}`,
    );
  }
  const inner = parseRequirementObject(
    val as Record<string, unknown>,
    state,
    context,
    nameStack,
  );
  return { not: inner };
}

function resolveNamed(
  name: string,
  state: ResolverState,
  context: DataContext,
  nameStack: string[],
): RequirementExpr {
  const cached = state.cache.get(name);
  if (cached) return cached;

  const currentState = state.states.get(name) ?? "unvisited";
  if (currentState === "visiting") {
    const cycle = [...nameStack, name].join(" -> ");
    throw new Error(`Requirement cycle: ${cycle} in ${context.sourceFile}`);
  }

  const body = state.registry[name];
  if (!body) {
    throw new Error(
      `Unknown requirement "${name}" referenced by ${context.entity ?? context.field} in ${context.sourceFile}`,
    );
  }

  state.states.set(name, "visiting");
  const newStack = [...nameStack, name];
  const resolved = parseRequirementObject(body, state, context, newStack);
  state.states.set(name, "resolved");
  state.cache.set(name, resolved);
  return resolved;
}
