/**
 * Shares an installed Fields of Mistria release with the development machines that don't have the
 * game. It extracts the structured asset subtrees from the Steam install's `assets.zip` into
 * `<drive>/v<game version>/assets/`, and files each local autosave under
 * `<drive>/v<version that wrote it>/save/`. Run it on the gaming PC after every game update:
 *
 *   pnpm run game-assets:share [-- --dry-run] [--force] [--drive=<dir>] [--archive=<assets.zip>]
 *                                 [--saves=<dir>] [--version=X.Y.Z]
 *
 * See docs/game-version-update-protocol.md#share-the-extracted-assets.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { inflateSync } from "node:zlib";

import { DEFAULT_WINDOWS_GAME_ARCHIVE, extractArchiveSubtrees } from "./parse/asset-input.js";
import { readInstalledGameVersion } from "./parse/assets-zip.js";

/** The Google Drive for desktop folder every development machine reads shared game files from. */
export const DEFAULT_DRIVE_DIR = String.raw`G:\My Drive\Mistria`;

/**
 * The archive subtrees worth sharing: the pipeline reads `fiddle/` & `localization/`; the rest are
 * small and useful for research. Animations, audio, and other bulk trees stay in the archive.
 */
export const SHARED_ARCHIVE_PREFIXES = [
  "assets/data_files/",
  "assets/etc/",
  "assets/fiddle/",
  "assets/gml/",
  "assets/localization/",
  "assets/tiled/",
] as const;

export interface ShareOptions {
  archivePath: string;
  driveDir: string;
  dryRun: boolean;
  force: boolean;
  log: (message: string) => void;
  savesDir: string | undefined;
  version: string;
}

/** Reads the game version that last wrote a `.sav` file, from its `info` entry. */
export function readSaveGameVersion(sav: Uint8Array): string | undefined {
  const data = Buffer.from(inflateSync(sav));
  let offset = 0;
  const readLength = () => {
    const value = Number(data.readBigUInt64LE(offset));
    offset += 8;
    return value;
  };
  const entryCount = readLength();
  for (let index = 0; index < entryCount; index++) {
    const nameLength = readLength();
    const name = data.toString("utf8", offset, offset + nameLength);
    offset += nameLength;
    const length = readLength();
    if (name === "info") {
      const info = JSON.parse(data.toString("utf8", offset, offset + length)) as {
        version?: { major: number; minor: number; patch: number };
      };
      const version = info.version;
      return version
        ? `${String(version.major)}.${String(version.minor)}.${String(version.patch)}`
        : undefined;
    }
    offset += length;
  }
  return undefined;
}

export async function shareGameAssets(options: ShareOptions): Promise<void> {
  const { driveDir, log } = options;
  if (!existsSync(driveDir)) {
    throw new Error(
      `Drive folder not found: ${driveDir}. Pass --drive=<dir> or set MISTRIA_DRIVE_DIR.`,
    );
  }
  await shareAssets(options);
  shareSaves(options);
  log(options.dryRun ? "Dry run: nothing was written." : "Done.");
}

function shareAssets({ archivePath, driveDir, dryRun, force, log, version }: ShareOptions) {
  const destination = join(driveDir, `v${version}`, "assets");
  if (existsSync(destination) && readdirSync(destination).length > 0 && !force) {
    log(`Assets: ${destination} already exists; skipping (pass --force to replace it).`);
    return Promise.resolve();
  }
  log(`Assets: ${archivePath} → ${destination}`);
  if (dryRun) return Promise.resolve();
  return replaceWithExtraction(archivePath, destination, log);
}

/** Extracts beside the destination first, so a failure never leaves a half-written version. */
async function replaceWithExtraction(
  archivePath: string,
  destination: string,
  log: (message: string) => void,
) {
  const staging = `${destination}.partial`;
  rmSync(staging, { force: true, recursive: true });
  const count = await extractArchiveSubtrees(archivePath, staging, SHARED_ARCHIVE_PREFIXES);
  if (count === 0) {
    rmSync(staging, { force: true, recursive: true });
    throw new Error(`No ${SHARED_ARCHIVE_PREFIXES.join(", ")} files in ${archivePath}`);
  }
  rmSync(destination, { force: true, recursive: true });
  // The archive's entries are all under `assets/`, so the staged tree's `assets/` is the root.
  renameSync(join(staging, "assets"), destination);
  rmSync(staging, { force: true, recursive: true });
  log(`  Extracted ${String(count)} files`);
}

function shareSaves({ driveDir, dryRun, log, savesDir }: ShareOptions) {
  if (!savesDir || !existsSync(savesDir)) {
    log(`Saves: no save folder at ${savesDir ?? "(unset)"}; skipping.`);
    return;
  }
  const autosaves = readdirSync(savesDir).filter((name) => name.endsWith("-autosave.sav"));
  if (autosaves.length === 0) log(`Saves: no autosaves in ${savesDir}.`);
  for (const name of autosaves) {
    const source = join(savesDir, name);
    const contents = readFileSync(source);
    const saveVersion = readSaveGameVersion(contents);
    if (!saveVersion) {
      log(`Saves: ${name} has no game version; skipping.`);
      continue;
    }
    const destination = join(driveDir, `v${saveVersion}`, "save", name);
    const action = saveAction(source, contents, destination);
    log(`Saves: ${name} (game ${saveVersion}) → ${destination}: ${action}`);
    if (action === "copy" && !dryRun) {
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }
  }
}

/** Keeps the newer of two different saves from one game version: later play holds more progress. */
function saveAction(source: string, contents: Buffer, destination: string) {
  if (!existsSync(destination)) return "copy";
  if (readFileSync(destination).equals(contents)) return "unchanged";
  return statSync(source).mtimeMs > statSync(destination).mtimeMs ? "copy" : "kept newer copy";
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: {
      archive: { type: "string" },
      drive: { type: "string" },
      "dry-run": { type: "boolean" },
      force: { type: "boolean" },
      saves: { type: "string" },
      version: { type: "string" },
    },
    strict: true,
  });
  const archivePath = values.archive ?? DEFAULT_WINDOWS_GAME_ARCHIVE;
  if (!existsSync(archivePath)) {
    throw new Error(`assets.zip not found at ${archivePath}. Pass --archive=<path>.`);
  }
  const version = values.version ?? readInstalledGameVersion(archivePath);
  if (!version) {
    throw new Error(
      "Couldn't read the game version from FieldsOfMistria.exe. Pass --version=X.Y.Z.",
    );
  }
  const localAppData = process.env.LOCALAPPDATA;
  await shareGameAssets({
    archivePath,
    driveDir: values.drive ?? process.env.MISTRIA_DRIVE_DIR ?? DEFAULT_DRIVE_DIR,
    dryRun: values["dry-run"] ?? false,
    force: values.force ?? false,
    log: (message) => {
      console.log(message);
    },
    savesDir: values.saves ?? (localAppData && join(localAppData, "FieldsOfMistria", "saves")),
    version,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
