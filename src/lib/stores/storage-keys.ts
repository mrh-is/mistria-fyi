/**
 * localStorage keys for player data. They're a public contract (`docs/app-architecture.md` §3):
 * renaming one abandons whatever players have stored under it. The theme key lives with the theme
 * constants in `#lib/theme.js`.
 */

/** The serialized progress blob, which is also the backup format. */
export const PROGRESS_STORAGE_KEY = "mistria-fyi:progress";
/** A progress blob that couldn't be read, kept so the player can download it. */
export const QUARANTINE_STORAGE_KEY = "mistria-fyi:progress-quarantine";
/** This device's display preferences, kept out of backups. */
export const PREFERENCES_STORAGE_KEY = "mistria-fyi:preferences";
