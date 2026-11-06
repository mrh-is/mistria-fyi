import { deflateSync } from "node:zlib";

const encoder = new TextEncoder();

/** Encode `n` as the 8-byte little-endian integer the `.sav` container uses for counts & lengths. */
export function u64LE(n: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(n), true);
  return bytes;
}

/**
 * Build an uncompressed `.sav` container from named entries: a u64 entry count, then per entry a
 * u64 name length, the name, a u64 data length, & the data. Objects are written as JSON; strings
 * are written as is, so a test can supply malformed JSON.
 */
export function buildRawSav(entries: Record<string, object | string>): Uint8Array<ArrayBuffer> {
  const entryList = Object.entries(entries);
  const parts: Uint8Array[] = [u64LE(entryList.length)];
  for (const [name, data] of entryList) {
    const nameBytes = encoder.encode(name);
    const dataBytes = encoder.encode(typeof data === "string" ? data : JSON.stringify(data));
    parts.push(u64LE(nameBytes.length), nameBytes, u64LE(dataBytes.length), dataBytes);
  }
  return Uint8Array.from(Buffer.concat(parts));
}

/** Build a `.sav` as the game writes it: the raw container, deflated. */
export function buildSavBytes(entries: Record<string, object | string>): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(deflateSync(buildRawSav(entries)));
}

/** Build a `.sav` as a `File`, named like an autosave unless `name` says otherwise. */
export function buildSavFile(
  entries: Record<string, object | string>,
  name = "game-1315159680-autosave.sav",
): File {
  return new File([buildSavBytes(entries)], name);
}
