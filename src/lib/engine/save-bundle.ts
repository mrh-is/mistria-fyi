/** All parsed save files bundled together */
export interface SaveBundle {
  gamedata?: SaveSection;
  player?: SaveSection;
  quests?: SaveSection;
}

/**
 * One parsed save section (`player`, `gamedata`, or `quests`). Its fields are untrusted JSON until
 * `buildImportState` reads them field by field.
 */
export type SaveSection = Record<string, unknown>;

/** Whether a parsed JSON value can be a save section: an object, but not an array or `null`. */
export function isSaveSection(value: unknown): value is SaveSection {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
