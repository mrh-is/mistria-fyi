import { isSaveSection, type SaveBundle } from "./save-bundle";

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
 * Parse a Fields of Mistria .sav file entirely in the browser.
 *
 * Format (after zlib decompression):
 *   [u64 LE entry_count]
 *   repeated entry_count times:
 *     [u64 LE name_len][name bytes (UTF-8)][u64 LE data_len][data bytes (UTF-8 JSON)]
 *
 * We extract the "player", "gamedata", and "quests" entries and parse them as JSON.
 */
export async function parseSavFile(
  file: File,
  limits: ParseSavLimits = DEFAULT_LIMITS,
): Promise<SaveBundle> {
  if (file.size > limits.maxCompressedSize) {
    throw new Error(
      `Save file is too large (${formatSize(file.size)}). ` +
        `Maximum supported size is ${formatSize(limits.maxCompressedSize)}.`,
    );
  }

  const compressed = await file.arrayBuffer();
  const decompressed = await decompress(compressed, limits.maxDecompressedSize);
  return extractBundle(decompressed);
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
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLen += value.length;
      if (totalLen > maxDecompressedSize) {
        await reader.cancel();
        throw new Error(
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

function extractBundle(data: Uint8Array): SaveBundle {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();

  if (data.length < 8) throw new Error("Not a valid .sav file: too short");

  const entryCount = u64(view, 0);
  if (entryCount > 10_000) throw new Error("Not a valid .sav file: implausible entry count");

  let offset = 8;
  const bundle: SaveBundle = {};

  for (let i = 0; i < entryCount; i++) {
    if (offset + 8 > data.length) {
      throw new Error("Unexpected end of .sav file while reading entry name length");
    }

    const nameLen = u64(view, offset);
    offset += 8;

    if (nameLen > 1000 || offset + nameLen > data.length) {
      throw new Error("Not a valid .sav file: invalid entry name length");
    }

    const name = decoder.decode(data.subarray(offset, offset + nameLen));
    offset += nameLen;

    if (offset + 8 > data.length) {
      throw new Error("Unexpected end of .sav file while reading entry data length");
    }

    const dataLen = u64(view, offset);
    offset += 8;

    if (offset + dataLen > data.length) {
      throw new Error("Unexpected end of .sav file: entry data extends past end");
    }

    if (name === "player" || name === "gamedata" || name === "quests") {
      const jsonStr = decoder.decode(data.subarray(offset, offset + dataLen));
      try {
        const parsed: unknown = JSON.parse(jsonStr);
        if (!isSaveSection(parsed)) {
          throw new Error(`Entry "${name}" is not a JSON object`);
        }
        bundle[name] = parsed;
      } catch (cause) {
        throw new Error(
          `Failed to parse "${name}" entry: ${cause instanceof Error ? cause.message : String(cause)}`,
          { cause },
        );
      }
    }

    offset += dataLen;
  }

  if (!bundle.player && !bundle.gamedata && !bundle.quests) {
    throw new Error(
      "No recognized save data found in this .sav file. Expected player, gamedata, or quests entries.",
    );
  }

  return bundle;
}

/** Format a byte count as a human-readable size string. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Read a u64 little-endian value as a JS number (safe for lengths up to 2^53). */
function u64(view: DataView, offset: number): number {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  return lo + hi * 0x100000000;
}
