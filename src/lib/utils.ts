import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type NonEmptyArray<T> = [T, ...T[]];

export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: null | U };

export type WithoutChild<T> = Omit<T, "child">;
export type WithoutChildrenOrChild<T> = Omit<T, "child" | "children">;
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isNonEmptyArray<T>(arr: T[]): arr is NonEmptyArray<T> {
  return arr.length > 0;
}

export function recordEntries<R extends Record<string, unknown>>(
  record: R,
): { [K in keyof R]-?: [K, NonNullable<R[K]>] }[keyof R][];
export function recordEntries(record: Record<string, unknown>) {
  return Object.entries(record);
}

export function recordForEach<K extends string, T>(
  record: Record<K, T>,
  callbackfn: (value: [K, T], index: number, record: Record<K, T>) => void,
  thisArg?: unknown,
) {
  recordKeys(record).forEach((key, index) => {
    callbackfn.call(thisArg, [key, record[key]], index, record);
  });
}
export function recordKeys<K extends string, T>(record: Record<K, T>): K[] {
  return Object.keys(record) as K[];
}
export function recordMap<K extends string, T, U>(
  record: Record<K, T>,
  callbackfn: (value: T, key: K, index: number, record: Record<K, T>) => U,
  thisArg?: unknown,
): Record<K, U> {
  const result = {} as Record<K, U>;
  recordKeys(record).forEach((key, index) => {
    result[key] = callbackfn.call(thisArg, record[key], key, index, record);
  });
  return result;
}
export function recordValues<K extends PropertyKey, T>(record: Record<K, T>): T[] {
  return Object.values(record);
}
