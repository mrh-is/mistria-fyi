import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { crc32 } from "node:zlib";
import { onTestFinished, vi } from "vitest";

import { LOCALE_CODES } from "#lib/types/locale.js";

import { createLocalizer } from "./localize/localize.js";
import { defaultAssetsDir } from "./parse/asset-input.js";
import { attachProvenance } from "./parse/parse-fiddle.js";

import type { Mock } from "vitest";

import type { LocaleCode } from "#lib/types/locale.js";

import type { GameLanguageCode } from "./localize/locale-codes.js";
import type { LocalizeFieldInput, Localizer, TranslationDirectory } from "./localize/localize.js";
import type { ParsedGameData } from "./parse/parse-fiddle.js";

type TranslationTable = Readonly<Record<string, string>>;

/** A {@link Localizer} whose method records its calls. */
interface StubLocalizer extends Localizer {
  localizeField: Mock<Localizer["localizeField"]>;
}

const temporaryAssetsDirectories: string[] = [];

/**
 * Builds a minimal, uncompressed ("stored") ZIP archive in memory, for tests that exercise
 * zip-reading code (e.g. {@link parseFiddleFromZip}) without depending on a zip-writer package.
 * `files` maps each entry's path inside the archive to its text content.
 */
export function buildStoredZip(files: Record<string, Buffer | string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf8");
    const dataBuf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    const crc = crc32(dataBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04_03_4b_50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // general purpose flag
    localHeader.writeUInt16LE(0, 8); // compression method: stored
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x21, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18); // compressed size
    localHeader.writeUInt32LE(dataBuf.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length
    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02_01_4b_50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // general purpose flag
    centralHeader.writeUInt16LE(0, 10); // compression method
    centralHeader.writeUInt16LE(0, 12); // mod time
    centralHeader.writeUInt16LE(0x21, 14); // mod date
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20); // compressed size
    centralHeader.writeUInt32LE(dataBuf.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attributes
    centralHeader.writeUInt32LE(0, 38); // external attributes
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header
    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const localSection = Buffer.concat(localParts);
  const centralSection = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06_05_4b_50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk where central directory starts
  eocd.writeUInt16LE(Object.keys(files).length, 8); // records on this disk
  eocd.writeUInt16LE(Object.keys(files).length, 10); // total records
  eocd.writeUInt32LE(centralSection.length, 12); // size of central directory
  eocd.writeUInt32LE(localSection.length, 16); // offset of central directory
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localSection, centralSection, eocd]);
}

export function createAssetsFixture(files: Record<string, Buffer | string>): string {
  const assetsDir = mkdtempSync(join(tmpdir(), "mistria-fyi-assets-"));
  temporaryAssetsDirectories.push(assetsDir);
  onTestFinished(() => {
    const fixtureIndex = temporaryAssetsDirectories.indexOf(assetsDir);
    if (fixtureIndex !== -1) {
      temporaryAssetsDirectories.splice(fixtureIndex, 1);
    }
    rmSync(assetsDir, { force: true, recursive: true });
  });

  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(assetsDir, "fiddle", relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }

  return assetsDir;
}

/**
 * A {@link Localizer} running the real key derivation & fallback logic over in-memory tables,
 * keyed by game language code (e.g. `{ jpn: { "npcs/balor/name": "バロル" } }`). Languages without
 * a table fall back to English.
 */
export function createMemoryLocalizer(
  tables: Partial<
    Record<TranslationDirectory, Partial<Record<GameLanguageCode, TranslationTable>>>
  >,
): Localizer {
  return createLocalizer(
    (gameLanguage, directory) => new Map(Object.entries(tables[directory]?.[gameLanguage] ?? {})),
  );
}

/**
 * A fiddle fixture with provenance attached, so code calling {@link sourceFileFor} resolves each
 * top-level key to `<key>.toml` (or to the matching entry in `sourceFiles`) instead of crashing.
 * `ParsedGameData` is untyped TOML (`Record<string, unknown>`), so the overrides are too.
 */
export function makeFiddle(
  overrides: Record<string, unknown> = {},
  sourceFiles: Readonly<Record<string, string>> = {},
): ParsedGameData {
  const sourceFileByRootPath = new Map(
    Object.keys(overrides).map((rootPath) => [rootPath, `${rootPath}.toml`]),
  );
  for (const [rootPath, sourceFile] of Object.entries(sourceFiles)) {
    sourceFileByRootPath.set(rootPath, sourceFile);
  }
  return attachProvenance(overrides, sourceFileByRootPath);
}

export function removeAssetsFixtures(): void {
  for (const directory of temporaryAssetsDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
}

export function requireGameAssetsDir(): string {
  const assetsDir = process.env.MISTRIA_ASSETS ?? defaultAssetsDir();
  const fiddleDir = join(assetsDir, "fiddle");
  if (!existsSync(fiddleDir) || !statSync(fiddleDir).isDirectory()) {
    throw new Error(
      `Game assets not found at ${fiddleDir}. Set MISTRIA_ASSETS to the assets directory.`,
    );
  }
  return assetsDir;
}

/**
 * A {@link Localizer} test double. Every locale gets `translate(input, locale)` or, when that
 * returns `undefined`, the English value; nothing is reported as a fallback. The method is a
 * `vi.fn`, so tests can assert on the inputs an extractor passes.
 */
export function stubLocalizer(
  translate: (input: LocalizeFieldInput, locale: LocaleCode) => string | undefined = () =>
    undefined,
): StubLocalizer {
  return {
    localizeField: vi.fn<Localizer["localizeField"]>((input) => ({
      fallbackLocales: [],
      values: Object.fromEntries(
        LOCALE_CODES.map((locale) => [
          locale,
          locale === "en" ? input.englishValue : (translate(input, locale) ?? input.englishValue),
        ]),
      ) as Record<LocaleCode, string>,
    })),
  };
}

/** Writes {@link buildStoredZip}'s output to a temp file and returns its path. */
export function writeStoredZipFixture(files: Record<string, Buffer | string>): string {
  const dir = mkdtempSync(join(tmpdir(), "mistria-fyi-zip-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  const zipPath = join(dir, "assets.zip");
  writeFileSync(zipPath, buildStoredZip(files));
  return zipPath;
}
