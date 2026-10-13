import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, win32 } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { open } from "yauzl-promise";

import { DEFAULT_WINDOWS_STEAM_ASSETS_DIR } from "./assets-zip.js";

export const DEFAULT_WINDOWS_GAME_ARCHIVE = win32.join(
  DEFAULT_WINDOWS_STEAM_ASSETS_DIR,
  "assets.zip",
);

/** The ignored local game-files root, `pipeline/input`, independent of the working directory. */
export const INPUT_ROOT = fileURLToPath(new URL("../../input", import.meta.url));

const COMMITTED_TRACKER_DATA = fileURLToPath(
  new URL("../../../src/lib/data/tracker-data.json", import.meta.url),
);

const VERSION_FOLDER = /^v\d+\.\d+\.\d+$/;

/** A game-files root holds one `vX.Y.Z/assets` folder per release. */
export function versionedAssetsDir(root: string, version: string): string {
  return join(root, `v${version}`, "assets");
}

/** Reads the game version the committed tracker data was generated from. */
export function readCommittedGameVersion(): string | undefined {
  try {
    const data = JSON.parse(readFileSync(COMMITTED_TRACKER_DATA, "utf8")) as { version?: unknown };
    return typeof data.version === "string" ? data.version : undefined;
  } catch {
    return undefined;
  }
}

/** The local assets for the committed tracker data's release, `pipeline/input/vX.Y.Z/assets`. */
export function defaultAssetsDir(version = readCommittedGameVersion()): string {
  if (!version) {
    throw new Error(`No game version in ${COMMITTED_TRACKER_DATA}. Set MISTRIA_ASSETS.`);
  }
  return versionedAssetsDir(INPUT_ROOT, version);
}

/**
 * Resolves a game-files root to its `vX.Y.Z/assets` folder. A directory that holds `fiddle/` or
 * `assets.zip`, or holds no version folders, passes through unchanged.
 */
export function resolveVersionedAssetsDir(dir: string, version: string | undefined): string {
  if (existsSync(join(dir, "fiddle")) || existsSync(join(dir, "assets.zip"))) return dir;
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return dir;
  if (!readdirSync(dir).some((name) => VERSION_FOLDER.test(name))) return dir;
  if (!version) {
    throw new Error(`${dir} holds versioned game files. Pass --version=X.Y.Z to pick one.`);
  }
  const versioned = versionedAssetsDir(dir, version);
  if (!existsSync(join(versioned, "fiddle"))) {
    throw new Error(`Game assets for ${version} not found at ${join(versioned, "fiddle")}.`);
  }
  return versioned;
}

const REQUIRED_PREFIXES = ["assets/fiddle/", "assets/localization/"];

export interface GameAssetsInput {
  archivePath?: string;
  assetsDir: string;
}

/** Resolves a directory or materializes only structured TOML from an installed assets.zip archive. */
export async function prepareGameAssets(input?: string): Promise<GameAssetsInput> {
  const selected = input ?? defaultGameAssetsInput();
  if (basename(selected) === "assets.zip" && !existsSync(selected)) {
    throw new Error(
      `Game archive not found at ${resolve(selected)}. Install the game or set MISTRIA_ASSETS.`,
    );
  }
  const archivePath = resolveArchivePath(selected);
  if (!archivePath) {
    const assetsDir = resolve(selected);
    if (existsSync(join(assetsDir, "fiddle"))) return { assetsDir };
    throw new Error(
      `Game assets not found at ${join(assetsDir, "fiddle")}. Pass an assets directory or assets.zip path.`,
    );
  }

  const root = await materializeStructuredAssets(archivePath);
  process.once("exit", () => {
    rmSync(root, { force: true, recursive: true });
  });
  return { archivePath, assetsDir: join(root, "assets") };
}

/**
 * Windows reads the installed Steam archive; other platforms read `pipeline/input/vX.Y.Z/assets` for the committed tracker data's version. Neither
 * falls back to the other, so a machine without its platform's source fails rather than silently
 * testing something else. `MISTRIA_ASSETS` overrides both.
 */
export function defaultGameAssetsInput(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? DEFAULT_WINDOWS_GAME_ARCHIVE : defaultAssetsDir();
}

/**
 * Writes every archive file whose path starts with one of `prefixes` to the same path under `root`,
 * and returns how many it wrote. Never expands the rest of the multi-gigabyte archive.
 */
export async function extractArchiveSubtrees(
  archivePath: string,
  root: string,
  prefixes: readonly string[],
): Promise<number> {
  let count = 0;
  const zip = await open(archivePath);
  try {
    for await (const entry of zip) {
      if (
        entry.filename.endsWith("/") ||
        !prefixes.some((prefix) => entry.filename.startsWith(prefix))
      ) {
        continue;
      }
      const outputPath = join(root, entry.filename);
      mkdirSync(dirname(outputPath), { recursive: true });
      await pipeline(await entry.openReadStream(), createWriteStream(outputPath));
      count++;
    }
  } finally {
    await zip.close();
  }
  return count;
}

async function materializeStructuredAssets(archivePath: string): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "mistria-fyi-assets-"));
  try {
    await extractArchiveSubtrees(archivePath, root, REQUIRED_PREFIXES);
  } catch (error) {
    rmSync(root, { force: true, recursive: true });
    throw error;
  }
  return root;
}

function resolveArchivePath(input: string): string | undefined {
  const resolved = resolve(input);
  if (existsSync(resolved) && statSync(resolved).isFile() && basename(resolved) === "assets.zip") {
    return resolved;
  }
  const nestedArchive = join(resolved, "assets.zip");
  return existsSync(nestedArchive) ? nestedArchive : undefined;
}
