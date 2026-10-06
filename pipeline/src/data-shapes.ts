/**
 * expectArray<T>() checks only the outer array shape. Its type parameter describes the caller's
 * expected elements and is not runtime validation.
 */
export interface SourceFieldLocation {
  entityId?: string;
  fieldPath: string;
  sourcePath: string;
}

function location(context: SourceFieldLocation): string {
  return `${context.entityId ? `${context.entityId}.` : ""}${context.fieldPath} in ${context.sourcePath}`;
}

export function expectString(value: unknown, context: SourceFieldLocation): string {
  if (typeof value !== "string") {
    throw new TypeError(`Expected string for ${location(context)}, got ${typeof value}`);
  }
  return value;
}

export function expectNumber(value: unknown, context: SourceFieldLocation): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Expected finite number for ${location(context)}, got ${String(value)}`);
  }
  return value;
}

export function expectRecord(
  value: unknown,
  context: SourceFieldLocation,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Expected record for ${location(context)}, got ${typeof value}`);
  }
  return value as Record<string, unknown>;
}

export function expectNumberArray(value: unknown, context: SourceFieldLocation): number[] {
  return expectArray<unknown>(value, context).map((entry, index) =>
    expectNumber(entry, { ...context, fieldPath: `${context.fieldPath}[${index}]` }),
  );
}

export function expectArray<T>(value: unknown, context: SourceFieldLocation): T[] {
  if (!Array.isArray(value)) {
    const loc = context.entityId ? `${context.entityId}.${context.fieldPath}` : context.fieldPath;
    throw new Error(`Expected array for ${loc} in ${context.sourcePath}, got ${typeof value}`);
  }
  return value as T[];
}

export function expectStringArray(value: unknown, context: SourceFieldLocation): string[] {
  const arr = expectArray<unknown>(value, context);
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] !== "string") {
      const loc = context.entityId ? `${context.entityId}.${context.fieldPath}` : context.fieldPath;
      throw new Error(
        `Expected string at index ${i} of ${loc} in ${context.sourcePath}, got ${typeof arr[i]}`,
      );
    }
  }
  return arr as string[];
}

export function expectNonEmptyString(value: unknown, context: SourceFieldLocation): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    const loc = context.entityId ? `${context.entityId}.${context.fieldPath}` : context.fieldPath;
    throw new Error(`Expected nonempty string for ${loc} in ${context.sourcePath}`);
  }
  return value;
}
