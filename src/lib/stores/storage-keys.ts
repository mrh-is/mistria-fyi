/**
 * localStorage keys for player data. They're a public contract (`docs/app-architecture.md` §3):
 * renaming one abandons whatever players have stored under it. The theme key lives with the theme
 * constants in `#lib/theme.js`.
 */

/** The serialized progress blob, which is also the backup format. */
export const PROGRESS_STORAGE_KEY = "mistria-fyi:progress";
/**
 * The Web Lock every progress write holds, so tabs write one at a time. Tabs on different builds
 * only exclude each other while they agree on it, so it's as much a contract as the key.
 */
export const PROGRESS_WRITE_LOCK = "mistria-fyi:progress-write";
/** A progress blob that couldn't be read, kept so the player can download it. */
export const QUARANTINE_STORAGE_KEY = "mistria-fyi:progress-quarantine";
/** This device's display preferences, kept out of backups. */
export const PREFERENCES_STORAGE_KEY = "mistria-fyi:preferences";
/**
 * The courier's upload counter & what it last uploaded. It lives apart from progress, so a blocked
 * store never holds an upload back & no erase, stop, or new code resets the counter.
 */
export const SYNC_UPLOADS_STORAGE_KEY = "mistria-fyi:sync-uploads";
