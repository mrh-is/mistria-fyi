import type { ParsedGameData } from "./parse-fiddle.js";

export function makeFiddle(overrides: Record<string, unknown> = {}): ParsedGameData {
  return overrides as unknown as ParsedGameData;
}
