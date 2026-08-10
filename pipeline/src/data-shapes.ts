export interface SourceFieldLocation {
  entityId?: string;
  fieldPath: string;
  sourcePath: string;
}

// expectArray<T>() checks only the outer array shape. Its type parameter describes the caller's
// expected elements and is not runtime validation.
export function expectArray<T>(value: unknown, context: SourceFieldLocation): T[] {
  if (!Array.isArray(value)) {
    const loc = context.entityId
      ? `${context.entityId}.${context.fieldPath}`
      : context.fieldPath;
    throw new Error(
      `Expected array for ${loc} in ${context.sourcePath}, got ${typeof value}`,
    );
  }
  return value as T[];
}

export function expectStringArray(value: unknown, context: SourceFieldLocation): string[] {
  const arr = expectArray<unknown>(value, context);
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] !== "string") {
      const loc = context.entityId
        ? `${context.entityId}.${context.fieldPath}`
        : context.fieldPath;
      throw new Error(
        `Expected string at index ${i} of ${loc} in ${context.sourcePath}, got ${typeof arr[i]}`,
      );
    }
  }
  return arr as string[];
}
