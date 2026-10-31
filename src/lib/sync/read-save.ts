/**
 * Reading a save file for sync: the dropped autosave on the gaming computer, or the save inside a
 * followed code's envelope. Both read the save's own container format with the importer's parser.
 */
import { extractSaveProgress, unpackSavFile } from "#lib/engine/import-save.js";
import { readSaveIdentity } from "#lib/engine/save-identity.js";

import type { SyncedSave } from "#lib/stores/user-state.svelte.js";

import type { SavePayload } from "./follow.js";

/** A save file read for sync, with the file it came from. */
export interface ReadSave extends SyncedSave {
  fileName: string;
  /** The file's modification time, in Unix milliseconds. */
  modified: number;
}

/** Reads a `.sav` file. Throws `SavArchiveError` when it isn't one this build can read. */
export async function readSaveFile(file: File, now = Date.now()): Promise<ReadSave> {
  const bundle = await unpackSavFile(file);
  const { completed, playtime } = extractSaveProgress(bundle);
  return {
    completed,
    fileName: file.name,
    metadata: { ...readSaveIdentity(bundle), importedAt: now },
    modified: file.lastModified,
    playtime,
  };
}

/** Reads the save inside an opened envelope, under the file name it travelled with. */
export function readSavePayload(
  { header, save }: SavePayload,
  now = Date.now(),
): Promise<ReadSave> {
  const file = new File([save], header.fileName, { lastModified: header.modified });
  return readSaveFile(file, now);
}
