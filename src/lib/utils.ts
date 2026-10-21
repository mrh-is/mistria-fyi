// shadcn-svelte's `utils` alias target (components.json). Keep this file to what the
// `components/ui/` code imports; general helpers belong in `utils/`, and the pipeline must not
// import this file, since it pulls `clsx` & `tailwind-merge` into Node.
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import type { ClassValue } from "clsx";

export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: null | U };

export type WithoutChildrenOrChild<T> = Omit<T, "child" | "children">;
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
