/**
 * Reading a save file for sync: the dropped autosave on the gaming computer, or the save inside a
 * followed code's envelope. Both read the save's own container format with the importer's parser.
 */
import { extractSave, progressOfExtraction, unpackSavFile } from "#lib/engine/import-save.js";
import { readSaveIdentity } from "#lib/engine/save-identity.js";
import { readGameDate } from "#lib/engine/sync-freshness.js";

import { toBase64url } from "./follow.js";

import type { SaveExtraction } from "#lib/engine/import-save.js";
import type { SyncReceipt } from "#lib/engine/sync-apply.js";
import type { GameDate } from "#lib/engine/sync-freshness.js";
import type { SyncApplyStamp, SyncedSave } from "#lib/stores/user-state.svelte.js";

import type { SavePayload } from "./follow.js";

/** A save file read for sync, with the file it came from. */
export interface ReadSave extends SyncedSave {
  extraction: SaveExtraction;
  fileName: string;
  gameDate: GameDate | undefined;
  /** The SHA-256 of the file's bytes, in base64url; what a receipt remembers it by. */
  hash: string;
  /** The file's modification time, in Unix milliseconds. */
  modified: number;
}

async function hashFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return toBase64url(new Uint8Array(digest));
}

/** Reads a `.sav` file. Throws `SavArchiveError` when it isn't one this build can read. */
export async function readSaveFile(file: File, now = Date.now()): Promise<ReadSave> {
  const bundle = await unpackSavFile(file);
  const extraction = extractSave(bundle);
  const { completed, playtime } = progressOfExtraction(extraction);
  return {
    completed,
    extraction,
    fileName: file.name,
    gameDate: readGameDate(bundle),
    hash: await hashFile(file),
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

/**
 * What applying `save` leaves in `local`. `envelope` is the mailbox & counter it came through; a
 * computer's own save has none.
 */
export function stampOf(
  save: ReadSave,
  envelope?: Required<Pick<SyncReceipt, "counter" | "mailboxId">>,
): SyncApplyStamp {
  return {
    gameDate: save.gameDate,
    modified: save.modified,
    receipt: { hash: save.hash, ...envelope },
  };
}
