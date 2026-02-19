/**
 * Parses the flat slash-key fiddle.json format into a nested object structure.
 *
 * Raw fiddle.json is a flat dictionary:
 *   { "npcs/holt/name": "npcs/holt/name", "npcs/holt/birthday/season": "winter", ... }
 *
 * This module converts it to:
 *   { npcs: { holt: { name: "npcs/holt/name", birthday: { season: "winter" } } } }
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Keys containing these substrings are visual/audio data — skip them
const SKIP_PATTERNS = [
  "sprite",
  "animation",
  "collision",
  "shadow",
  "offset",
  "_fx",
  "sound",
  "music",
  "idle_range",
  "move_range",
  "speed_range",
  "portrait_fallback",
  "post_process",
  "priority_grass",
  "priority_objects",
  "footsteps",
  "exterior_lights",
  "lights/",
  "rumbles/",
  "tile_cursor",
  "tool_fx",
  "camera/",
  "fonts/",
  "lut_index",
  "icon_sprite",
  "journal_portrait",
  "journal_background",
  "preview_sprite",
];

// Top-level sections to skip entirely (visual/audio/UI-only)
const SKIP_SECTIONS = new Set([
  "activities",
  "barks",
  "birds",
  "camera",
  "doors",
  "exterior_lights",
  "fonts",
  "footsteps",
  "gossip",
  "grow_back",
  "interaction",
  "lights",
  "player",
  "player_home",
  "portrait_fallback",
  "post_process",
  "priority_grass",
  "priority_objects",
  "props",
  "routines",
  "rumbles",
  "sha",
  "shooting_star",
  "summit",
  "tile_cursor",
  "time_of_day",
  "tool_fx",

  "weather",
]);

export type FiddleData = Record<string, unknown>;

export function parseFiddle(inputDir: string): FiddleData {
  const fiddlePath = resolve(inputDir, "__fiddle__.json");
  const raw: Record<string, unknown> = JSON.parse(readFileSync(fiddlePath, "utf-8"));

  const result: FiddleData = {};
  let kept = 0;
  let skipped = 0;

  for (const [key, value] of Object.entries(raw)) {
    if (shouldSkipKey(key)) {
      skipped++;
      continue;
    }

    const parts = key.split("/");
    setNestedValue(result, parts, value);
    kept++;
  }

  console.log(
    `  Parsed fiddle.json: ${kept.toLocaleString()} keys kept, ${skipped.toLocaleString()} skipped`,
  );
  return result;
}

function setNestedValue(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = path[path.length - 1];
  // Don't overwrite an existing object with a primitive
  if (lastKey in current && typeof current[lastKey] === "object" && current[lastKey] !== null) {
    return;
  }
  current[lastKey] = value;
}

function shouldSkipKey(key: string): boolean {
  const section = key.split("/")[0];
  if (SKIP_SECTIONS.has(section)) return true;
  return SKIP_PATTERNS.some((p) => key.includes(p));
}
