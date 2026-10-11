import { createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
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

/** The ignored local assets directory, `pipeline/input/assets`, independent of the working directory. */
export const DEFAULT_ASSETS_DIR = fileURLToPath(new URL("../../input/assets", import.meta.url));

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
 * Windows reads the installed Steam archive; other platforms read `pipeline/input/assets`. Neither
 * falls back to the other, so a machine without its platform's source fails rather than silently
 * testing something else. `MISTRIA_ASSETS` overrides both.
 */
export function defaultGameAssetsInput(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? DEFAULT_WINDOWS_GAME_ARCHIVE : DEFAULT_ASSETS_DIR;
}

async function materializeStructuredAssets(archivePath: string): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "mistria-fyi-assets-"));
  const zip = await open(archivePath);
  try {
    for await (const entry of zip) {
      if (
        entry.filename.endsWith("/") ||
        !REQUIRED_PREFIXES.some((prefix) => entry.filename.startsWith(prefix))
      ) {
        continue;
      }
      const outputPath = join(root, entry.filename);
      mkdirSync(dirname(outputPath), { recursive: true });
      await pipeline(await entry.openReadStream(), createWriteStream(outputPath));
    }
  } catch (error) {
    rmSync(root, { force: true, recursive: true });
    throw error;
  } finally {
    await zip.close();
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
