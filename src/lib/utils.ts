import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: null | U };

export type WithoutChild<T> = Omit<T, "child">;
export type WithoutChildren<T> = Omit<T, "children">;
export type WithoutChildrenOrChild<T> = Omit<T, "child" | "children">;
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function recordKeys<K extends string, T>(record: Record<K, T>): K[] {
  return Object.keys(record) as K[];
}
export function recordToArray<K extends string, T>(record: Record<K, T>): [K, T][] {
  return Object.entries(record) as [K, T][];
}
