export interface DataContext {
  entity?: string;
  field: string;
  sourceFile: string;
}

export function expectArray<T>(value: unknown, context: DataContext): T[] {
  if (!Array.isArray(value)) {
    const loc = context.entity ? `${context.entity}.${context.field}` : context.field;
    throw new Error(
      `Expected array for ${loc} in ${context.sourceFile}, got ${typeof value}`,
    );
  }
  return value as T[];
}

export function expectStringArray(value: unknown, context: DataContext): string[] {
  const arr = expectArray<unknown>(value, context);
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] !== "string") {
      const loc = context.entity ? `${context.entity}.${context.field}` : context.field;
      throw new Error(
        `Expected string at index ${i} of ${loc} in ${context.sourceFile}, got ${typeof arr[i]}`,
      );
    }
  }
  return arr as string[];
}
