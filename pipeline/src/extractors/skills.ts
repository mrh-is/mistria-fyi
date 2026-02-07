import type { SkillId, TrackerData } from "$lib/types/tracker-data.js";

import type { FiddleData } from "../parse-fiddle.js";

export function extractSkills(fiddle: FiddleData): TrackerData["skills"] {
  const skills = fiddle.skills as Record<string, Record<string, unknown>> | undefined;
  if (!skills) return {} as TrackerData["skills"];

  const result = {} as Record<SkillId, string>;
  for (const id of Object.keys(skills)) {
    if (id === "default") continue;
    const name = (skills[id].name as string | undefined) ?? snakeToTitle(id);
    result[id as SkillId] = name;
  }

  console.log(`  Skills: ${Object.keys(result).length}`);
  return result;
}

function snakeToTitle(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
