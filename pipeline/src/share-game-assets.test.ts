import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it, onTestFinished } from "vitest";

import { readSaveGameVersion, shareGameAssets } from "./share-game-assets.js";
import { writeStoredZipFixture } from "./test-helpers.js";

import type { ShareOptions } from "./share-game-assets.js";

/** A `.sav`: raw-deflated u64 LE entry count, then u64 LE length-prefixed names & JSON payloads. */
function buildSav(entries: Record<string, unknown>): Buffer {
  const parts: Buffer[] = [u64(Object.keys(entries).length)];
  for (const [name, value] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(JSON.stringify(value));
    parts.push(u64(nameBytes.length), nameBytes, u64(data.length), data);
  }
  return deflateSync(Buffer.concat(parts));
}

function u64(value: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "mistria-share-"));
  onTestFinished(() => {
    rmSync(directory, { force: true, recursive: true });
  });
  return directory;
}

function setup(overrides: Partial<ShareOptions> = {}) {
  const driveDir = temporaryDirectory();
  const savesDir = temporaryDirectory();
  const archivePath = writeStoredZipFixture({
    "assets/animations/huge.png": "skip me",
    "assets/fiddle/items.toml": "[turnip]",
    "assets/localization/l10n.meta.toml": "",
  });
  const messages: string[] = [];
  const options: ShareOptions = {
    archivePath,
    driveDir,
    dryRun: false,
    force: false,
    log: (message) => messages.push(message),
    savesDir,
    version: "1.0.6",
    ...overrides,
  };
  return { driveDir, messages, options, savesDir };
}

const SAVE_1_0_4 = buildSav({
  header: {},
  info: { version: { major: 1, minor: 0, patch: 4, pre: null } },
});

describe("readSaveGameVersion", () => {
  it("reads the version that last wrote the save", () => {
    expect(readSaveGameVersion(SAVE_1_0_4)).toBe("1.0.4");
  });

  it("returns undefined without an info entry", () => {
    expect(readSaveGameVersion(buildSav({ player: {} }))).toBeUndefined();
  });
});

describe("shareGameAssets", () => {
  it("extracts only the shared subtrees and files autosaves by the version that wrote them", async () => {
    const { driveDir, options, savesDir } = setup();
    writeFileSync(join(savesDir, "game-1-autosave.sav"), SAVE_1_0_4);
    writeFileSync(join(savesDir, "game-1-123.sav"), SAVE_1_0_4);

    await shareGameAssets(options);

    const assets = join(driveDir, "v1.0.6", "assets");
    expect(readFileSync(join(assets, "fiddle/items.toml"), "utf8")).toBe("[turnip]");
    expect(existsSync(join(assets, "localization/l10n.meta.toml"))).toBe(true);
    expect(existsSync(join(assets, "animations"))).toBe(false);
    expect(existsSync(join(driveDir, "v1.0.6", "assets.partial"))).toBe(false);
    expect(readFileSync(join(driveDir, "v1.0.4", "save", "game-1-autosave.sav"))).toEqual(
      SAVE_1_0_4,
    );
    expect(existsSync(join(driveDir, "v1.0.4", "save", "game-1-123.sav"))).toBe(false);
  });

  it("leaves already-shared assets alone unless forced", async () => {
    const { driveDir, messages, options } = setup();
    const assets = join(driveDir, "v1.0.6", "assets");
    mkdirSync(assets, { recursive: true });
    writeFileSync(join(assets, "keep.txt"), "");

    await shareGameAssets(options);
    expect(existsSync(join(assets, "keep.txt"))).toBe(true);
    expect(messages.join("\n")).toMatch(/already exists; skipping/);

    await shareGameAssets({ ...options, force: true });
    expect(existsSync(join(assets, "keep.txt"))).toBe(false);
    expect(existsSync(join(assets, "fiddle/items.toml"))).toBe(true);
  });

  it("keeps the newer save when a different one already exists for that version", async () => {
    const { driveDir, messages, options, savesDir } = setup();
    const source = join(savesDir, "game-1-autosave.sav");
    const shared = join(driveDir, "v1.0.4", "save", "game-1-autosave.sav");
    const newerShared = buildSav({ info: { version: { major: 1, minor: 0, patch: 4 } }, more: 1 });
    writeFileSync(source, SAVE_1_0_4);
    mkdirSync(join(driveDir, "v1.0.4", "save"), { recursive: true });
    writeFileSync(shared, newerShared);
    utimesSync(source, new Date(2026, 0, 1), new Date(2026, 0, 1));

    await shareGameAssets(options);

    expect(readFileSync(shared)).toEqual(newerShared);
    expect(messages.join("\n")).toMatch(/kept newer copy/);
  });

  it("writes nothing on a dry run", async () => {
    const { driveDir, options, savesDir } = setup({ dryRun: true });
    writeFileSync(join(savesDir, "game-1-autosave.sav"), SAVE_1_0_4);

    await shareGameAssets(options);

    expect(existsSync(join(driveDir, "v1.0.6"))).toBe(false);
    expect(existsSync(join(driveDir, "v1.0.4"))).toBe(false);
  });

  it("fails when the Drive folder is missing", async () => {
    const { options } = setup();
    await expect(
      shareGameAssets({ ...options, driveDir: join(options.driveDir, "nope") }),
    ).rejects.toThrow(/Drive folder not found/);
  });
});
