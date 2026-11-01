import {
  hasProgressSection,
  isIdentitySection,
  isProgressSection,
  isSaveSection,
} from "./save-bundle.js";

import type { SaveBundle } from "./save-bundle.js";

/** Maximum compressed input size: over 27x the measured 298,271-byte late-game fixture. */
export const MAX_COMPRESSED_SIZE = 8 * 1024 * 1024;

/** Maximum output size: over 20x the measured 3,216,869-byte late-game fixture. */
export const MAX_DECOMPRESSED_SIZE = 64 * 1024 * 1024;

interface ParseSavLimits {
  maxCompressedSize: number;
  maxDecompressedSize: number;
}

const DEFAULT_LIMITS: ParseSavLimits = {
  maxCompressedSize: MAX_COMPRESSED_SIZE,
  maxDecompressedSize: MAX_DECOMPRESSED_SIZE,
};

/**
 * Why a .sav file could not be read. The UI localizes the detail; the English message is for
 * debugging only.
 *
 * - `too-large`: the file exceeds the compressed size limit.
 * - `decompressed-too-large`: the decompressed data exceeds its size limit.
 * - `corrupt`: the file isn't valid compressed save data.
 * - `invalid-entry`: a recognized entry isn't a JSON object.
 * - `no-save-data`: the file has none of the player, gamedata, or quests entries.
 */
export type SavArchiveErrorDetail =
  | { code: "corrupt" }
  | { code: "decompressed-too-large"; maxBytes: number }
  | { code: "invalid-entry"; entry: string }
  | { code: "no-save-data" }
  | { code: "too-large"; maxBytes: number; sizeBytes: number };

export class SavArchiveError extends Error {
  readonly detail: SavArchiveErrorDetail;

  constructor(detail: SavArchiveErrorDetail, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SavArchiveError";
    this.detail = detail;
  }
}

/**
 * Parse a Fields of Mistria .sav file entirely in the browser.
 *
 * Format (after zlib decompression):
 *   [u64 LE entry_count]
 *   repeated entry_count times:
 *     [u64 LE name_len][name bytes (UTF-8)][u64 LE data_len][data bytes (UTF-8 JSON)]
 *
 * We extract the "player", "gamedata", and "quests" entries, which record progress, and the
 * "header" & "info" entries, which identify the save, and parse them as JSON. Every rejection is a
 * {@link SavArchiveError}.
 */
export async function parseSavArchive(
  file: File,
  limits: ParseSavLimits = DEFAULT_LIMITS,
): Promise<SaveBundle> {
  if (file.size > limits.maxCompressedSize) {
    throw new SavArchiveError(
      { code: "too-large", maxBytes: limits.maxCompressedSize, sizeBytes: file.size },
      `Save file is too large (${formatSize(file.size)}). ` +
        `Maximum supported size is ${formatSize(limits.maxCompressedSize)}.`,
    );
  }

  const compressed = await file.arrayBuffer();
  let decompressed: Uint8Array;
  try {
    decompressed = await decompress(compressed, limits.maxDecompressedSize);
  } catch (error) {
    if (error instanceof SavArchiveError) throw error;
    throw corrupt("Save file is not valid compressed data", { cause: error });
  }
  const bundle = extractBundle(decompressed);
  const saveNumber = /^game-(\d+)-(?:autosave|\d+)\.sav$/i.exec(file.name)?.[1];
  if (saveNumber !== undefined) bundle.saveNumber = saveNumber;
  return bundle;
}

/** The sections no importer reads, which sync leaves behind (`docs/sync.md` § The courier). */
const PRUNED_SECTIONS: ReadonlySet<string> = new Set(["date_photos", "farm", "game_stats"]);

/**
 * A save without {@link PRUNED_SECTIONS}, in the save's own container format, so every reader reuses
 * {@link parseSavArchive}. The other entries stay byte for byte in their original order. Throws
 * {@link SavArchiveError} when `file` isn't a save: it can't be walked, or holds no progress section.
 */
export async function pruneSavArchive(
  file: Blob,
  limits: ParseSavLimits = DEFAULT_LIMITS,
): Promise<Uint8Array<ArrayBuffer>> {
  if (file.size > limits.maxCompressedSize) {
    throw new SavArchiveError(
      { code: "too-large", maxBytes: limits.maxCompressedSize, sizeBytes: file.size },
      `Save file is too large (${formatSize(file.size)}).`,
    );
  }
  let decompressed: Uint8Array;
  try {
    decompressed = await decompress(await file.arrayBuffer(), limits.maxDecompressedSize);
  } catch (error) {
    if (error instanceof SavArchiveError) throw error;
    throw corrupt("Save file is not valid compressed data", { cause: error });
  }
  const entries = [...savEntries(decompressed)];
  if (!entries.some(({ name }) => isProgressSection(name))) {
    throw new SavArchiveError(
      { code: "no-save-data" },
      "No recognized save data found in this .sav file.",
    );
  }
  const kept = entries.filter(({ name }) => !PRUNED_SECTIONS.has(name));
  const length = kept.reduce(
    (total, { data, nameBytes }) => total + 16 + nameBytes.length + data.length,
    8,
  );
  const pruned = new Uint8Array(length);
  const view = new DataView(pruned.buffer);
  const setU64 = (at: number, value: number): void => {
    view.setBigUint64(at, BigInt(value), true);
  };
  setU64(0, kept.length);
  let offset = 8;
  for (const { data, nameBytes } of kept) {
    setU64(offset, nameBytes.length);
    pruned.set(nameBytes, offset + 8);
    offset += 8 + nameBytes.length;
    setU64(offset, data.length);
    pruned.set(data, offset + 8);
    offset += 8 + data.length;
  }
  const compressed = new Blob([pruned]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

function corrupt(message: string, options?: ErrorOptions): SavArchiveError {
  return new SavArchiveError({ code: "corrupt" }, message, options);
}

async function decompress(
  compressed: ArrayBuffer,
  maxDecompressedSize: number,
): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  // Write and drain concurrently — awaiting write before reading can deadlock
  // if the stream's internal buffer fills up before we start consuming.
  const writeAndClose = async () => {
    await writer.write(new Uint8Array(compressed));
    await writer.close();
  };

  const drain = async () => {
    const chunks: Uint8Array[] = [];
    let totalLen = 0;
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- stream reads must be sequential; each read depends on the previous one
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLen += value.length;
      if (totalLen > maxDecompressedSize) {
        // oxlint-disable-next-line no-await-in-loop -- cancels the stream, then exits the read loop by throwing
        await reader.cancel();
        throw new SavArchiveError(
          { code: "decompressed-too-large", maxBytes: maxDecompressedSize },
          `Decompressed save data exceeds the maximum supported size ` +
            `(${formatSize(maxDecompressedSize)}). The file may be corrupt.`,
        );
      }
    }
    return { chunks, totalLen };
  };

  const [, { chunks, totalLen }] = await Promise.all([writeAndClose(), drain()]);

  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}

/** One entry of the container, with its bytes unread. */
interface SavEntry {
  data: Uint8Array;
  name: string;
  nameBytes: Uint8Array;
}

/**
 * Walks the container's entries in order, throwing on anything that isn't one.
 *
 * @yields {SavEntry} Each entry in the file's order.
 */
function* savEntries(data: Uint8Array): Generator<SavEntry> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();

  if (data.length < 8) throw corrupt("Not a valid .sav file: too short");

  const entryCount = u64(view, 0);
  if (entryCount > 10_000) throw corrupt("Not a valid .sav file: implausible entry count");

  let offset = 8;

  for (let i = 0; i < entryCount; i++) {
    if (offset + 8 > data.length) {
      throw corrupt("Unexpected end of .sav file while reading entry name length");
    }

    const nameLen = u64(view, offset);
    offset += 8;

    if (nameLen > 1000 || offset + nameLen > data.length) {
      throw corrupt("Not a valid .sav file: invalid entry name length");
    }

    const nameBytes = data.subarray(offset, offset + nameLen);
    offset += nameLen;

    if (offset + 8 > data.length) {
      throw corrupt("Unexpected end of .sav file while reading entry data length");
    }

    const dataLen = u64(view, offset);
    offset += 8;

    if (offset + dataLen > data.length) {
      throw corrupt("Unexpected end of .sav file: entry data extends past end");
    }

    yield {
      data: data.subarray(offset, offset + dataLen),
      name: decoder.decode(nameBytes),
      nameBytes,
    };
    offset += dataLen;
  }
}

function extractBundle(data: Uint8Array): SaveBundle {
  const decoder = new TextDecoder();
  const bundle: SaveBundle = {};

  for (const { data: entry, name } of savEntries(data)) {
    if (isIdentitySection(name)) {
      // Identity sections only label the save, so an unreadable one never blocks the import:
      // it's left out, and extraction reports its fields absent.
      const parsed = tryParseJson(decoder.decode(entry));
      if (isSaveSection(parsed)) bundle[name] = parsed;
    } else if (isProgressSection(name)) {
      const jsonStr = decoder.decode(entry);
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (error) {
        throw new SavArchiveError(
          { code: "invalid-entry", entry: name },
          `Failed to parse "${name}" entry: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      if (!isSaveSection(parsed)) {
        throw new SavArchiveError(
          { code: "invalid-entry", entry: name },
          `Entry "${name}" is not a JSON object`,
        );
      }
      bundle[name] = parsed;
    }
  }

  if (!hasProgressSection(bundle)) {
    throw new SavArchiveError(
      { code: "no-save-data" },
      "No recognized save data found in this .sav file. Expected player, gamedata, or quests entries.",
    );
  }

  return bundle;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Format a byte count for the English debugging message; the UI formats sizes per locale. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Read a u64 little-endian value as a JS number (safe for lengths up to 2^53). */
function u64(view: DataView, offset: number): number {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  return lo + hi * 0x1_00_00_00_00;
}
