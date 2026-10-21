/**
 * All parsed save sections bundled together. `player`, `gamedata`, & `quests` record progress;
 * `header` & `info` hold the facts that identify a save (its playtime & creation version).
 */
export interface SaveBundle {
  gamedata?: SaveSection;
  header?: SaveSection;
  info?: SaveSection;
  player?: SaveSection;
  quests?: SaveSection;
  /** Random game number in a native save filename, independent of its autosave/manual slot. */
  saveNumber?: string;
}

/** The sections that record progress; a bundle needs at least one of them to import. */
export const PROGRESS_SECTIONS = ["gamedata", "player", "quests"] as const;
/** The sections that only identify a save. */
export const IDENTITY_SECTIONS = ["header", "info"] as const;
export type SaveSectionName =
  | (typeof IDENTITY_SECTIONS)[number]
  | (typeof PROGRESS_SECTIONS)[number];

/**
 * One parsed save section. Its fields are untrusted JSON until `extractSave` reads them field by
 * field.
 */
export type SaveSection = Record<string, unknown>;

export function isProgressSection(name: string): name is (typeof PROGRESS_SECTIONS)[number] {
  return (PROGRESS_SECTIONS as readonly string[]).includes(name);
}

export function isIdentitySection(name: string): name is (typeof IDENTITY_SECTIONS)[number] {
  return (IDENTITY_SECTIONS as readonly string[]).includes(name);
}

/** Whether a bundle holds any progress, rather than only a save's identity. */
export function hasProgressSection(bundle: SaveBundle): boolean {
  return PROGRESS_SECTIONS.some((name) => bundle[name] !== undefined);
}

/** Whether a parsed JSON value can be a save section: an object, but not an array or `null`. */
export function isSaveSection(value: unknown): value is SaveSection {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
