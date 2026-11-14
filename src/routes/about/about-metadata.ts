import type { Runtime } from "wuchale/runtime";

// Wuchale rewrites the source text to read the explicit runtime argument.
export function aboutMetadata(_runtime: Runtime): { description: string; title: string } {
  return {
    description: "Learn about the unofficial Mistria Field Guide for Fields of Mistria.",
    title: "About",
  };
}
