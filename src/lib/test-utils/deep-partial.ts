export type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

export function deepMerge<T extends object>(target: T, source?: DeepPartial<T>): T {
  if (!source) return target;

  const output = { ...target };

  for (const key of Object.keys(source) as (keyof typeof source)[]) {
    const sourceVal = source[key];
    const targetVal = target[key as unknown as keyof T];

    if (isObject(sourceVal) && isObject(targetVal)) {
      output[key as unknown as keyof T] = deepMerge(
        targetVal,
        sourceVal as DeepPartial<typeof targetVal>,
      );
    } else if (sourceVal !== undefined) {
      output[key as unknown as keyof T] = sourceVal as T[keyof T];
    }
  }

  return output;
}

function isObject(item: unknown): item is Record<PropertyKey, unknown> {
  return typeof item === "object" && item !== null && !Array.isArray(item);
}
