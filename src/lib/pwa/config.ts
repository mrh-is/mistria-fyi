/** Shared with SvelteKit configuration so worker bypass paths follow app-directory changes. */
export const APP_DIRECTORY = "_app";
export const VERSION_METADATA_PATH = `${APP_DIRECTORY}/version.json`;
/** Content-addressed build output: a file here never changes, so any version's cached copy is valid. */
export const IMMUTABLE_DIRECTORY = `${APP_DIRECTORY}/immutable`;
