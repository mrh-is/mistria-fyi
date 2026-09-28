import { describe, expect, it, vi } from "vitest";

import { MAX_COMPRESSED_SIZE, parseSavFile } from "./parse-sav";

// ─── Helpers ───────────────────────────────────────────────────────

const encoder = new TextEncoder();

/** Build an uncompressed .sav-format buffer from named JSON entries. */
function buildRawSav(entries: Record<string, object>): Uint8Array {
  const parts: Uint8Array[] = [];
  const entryList = Object.entries(entries);

  parts.push(u64LE(entryList.length));

  for (const [name, data] of entryList) {
    const nameBytes = encoder.encode(name);
    const dataBytes = encoder.encode(JSON.stringify(data));
    parts.push(u64LE(nameBytes.length));
    parts.push(nameBytes);
    parts.push(u64LE(dataBytes.length));
    parts.push(dataBytes);
  }

  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** Deflate-compress raw bytes and wrap as a File for parseSavFile. */
async function compressToFile(raw: Uint8Array, name = "test.sav"): Promise<File> {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();

  const writeAndClose = async () => {
    await writer.write(
      new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) as Uint8Array<ArrayBuffer>,
    );
    await writer.close();
  };

  const drain = async () => {
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return chunks;
  };

  const [, chunks] = await Promise.all([writeAndClose(), drain()]);
  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
  const compressed = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    compressed.set(chunk, offset);
    offset += chunk.length;
  }

  return new File([compressed], name);
}

/** Write a u64 LE into an 8-byte Uint8Array. */
function u64LE(n: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, n >>> 0, true);
  view.setUint32(4, Math.floor(n / 0x100000000), true);
  return new Uint8Array(buf);
}

// ─── parseSavFile ──────────────────────────────────────────────────

describe("parseSavFile", () => {
  it("extracts player, gamedata, and quests entries", async () => {
    const player = { gold: 500, name: "TestPlayer" };
    const gamedata = { day: 5, season: "spring" };
    const quests = { active: ["quest1"] };

    const raw = buildRawSav({ gamedata, player, quests });
    const file = await compressToFile(raw);
    const bundle = await parseSavFile(file);

    expect(bundle.player).toEqual(player);
    expect(bundle.gamedata).toEqual(gamedata);
    expect(bundle.quests).toEqual(quests);
  });

  it("ignores non-recognized entries", async () => {
    const player = { name: "TestPlayer" };
    const raw = buildRawSav({ player, settings: { volume: 0.5 }, world: { rain: true } });
    const file = await compressToFile(raw);
    const bundle = await parseSavFile(file);

    expect(bundle.player).toEqual(player);
    expect(bundle).not.toHaveProperty("settings");
    expect(bundle).not.toHaveProperty("world");
  });

  it("works with only player entry", async () => {
    const raw = buildRawSav({ player: { name: "Solo" } });
    const file = await compressToFile(raw);
    const bundle = await parseSavFile(file);

    expect(bundle.player).toEqual({ name: "Solo" });
    expect(bundle.gamedata).toBeUndefined();
    expect(bundle.quests).toBeUndefined();
  });

  it("works with only gamedata entry", async () => {
    const raw = buildRawSav({ gamedata: { day: 1 } });
    const file = await compressToFile(raw);
    const bundle = await parseSavFile(file);

    expect(bundle.gamedata).toEqual({ day: 1 });
  });

  it("throws on file with no recognized entries", async () => {
    const raw = buildRawSav({ settings: { volume: 0.5 } });
    const file = await compressToFile(raw);

    await expect(parseSavFile(file)).rejects.toThrow("No recognized save data");
  });

  it("throws on truncated data", async () => {
    const raw = new Uint8Array([1, 2, 3]);
    const file = await compressToFile(raw);

    await expect(parseSavFile(file)).rejects.toThrow();
  });

  it("handles empty entries object (zero entry count)", async () => {
    const raw = u64LE(0);
    const file = await compressToFile(raw);

    await expect(parseSavFile(file)).rejects.toThrow("No recognized save data");
  });

  it("handles entries with complex nested JSON", async () => {
    const player = {
      flags: { tutorialDone: true },
      inventory: [
        { count: 5, id: "item1" },
        { count: 1, id: "item2" },
      ],
      stats: { health: 100, stamina: 50 },
    };
    const raw = buildRawSav({ player });
    const file = await compressToFile(raw);
    const bundle = await parseSavFile(file);

    expect(bundle.player).toEqual(player);
  });
});

// ─── Size bounds ────────────────────────────────────────────────────

describe("parseSavFile size bounds", () => {
  it("rejects a compressed file exceeding MAX_COMPRESSED_SIZE", async () => {
    const file = new File([], "huge.sav");
    Object.defineProperty(file, "size", { value: MAX_COMPRESSED_SIZE + 1 });
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");

    await expect(parseSavFile(file)).rejects.toThrow("Save file is too large");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects decompressed data exceeding MAX_DECOMPRESSED_SIZE", async () => {
    const testDecompressedLimit = 1024;
    const expandedSize = testDecompressedLimit + 1;
    const raw = new Uint8Array(expandedSize); // all zeros — compresses extremely well
    const file = await compressToFile(raw);

    // Verify our test data actually fits under the compressed limit
    const compressedBlob = await file.arrayBuffer();
    expect(compressedBlob.byteLength).toBeLessThan(MAX_COMPRESSED_SIZE);

    await expect(
      parseSavFile(file, {
        maxCompressedSize: MAX_COMPRESSED_SIZE,
        maxDecompressedSize: testDecompressedLimit,
      }),
    ).rejects.toThrow("Decompressed save data exceeds the maximum supported size");
  });

  it("accepts a valid save well within both limits", async () => {
    const raw = buildRawSav({ player: { name: "Normal" } });
    const file = await compressToFile(raw);
    const bundle = await parseSavFile(file);

    expect(bundle.player).toEqual({ name: "Normal" });
  });

  it("throws a meaningful error for corrupt non-deflate data", async () => {
    // Random bytes that are not valid deflate
    const garbage = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04]);
    const file = new File([garbage], "corrupt.sav");

    await expect(parseSavFile(file)).rejects.toThrow();
  });
});
