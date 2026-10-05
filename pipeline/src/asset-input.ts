import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { open } from "yauzl-promise";

export const DEFAULT_WINDOWS_GAME_ARCHIVE = String.raw`C:\Program Files (x86)\Steam\steamapps\common\Fields of Mistria\assets.zip`;

const REQUIRED_PREFIXES = ["assets/fiddle/", "assets/localization/"];

export interface GameAssetsInput {
  archivePath?: string;
  assetsDir: string;
}

/** Resolves a directory or materializes only structured TOML from an installed assets.zip archive. */
export async function prepareGameAssets(input?: string): Promise<GameAssetsInput> {
  const selected = input ?? defaultInput();
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

/** Reads the Product Version of the installed Windows executable beside an assets archive. */
export function readInstalledGameVersion(archivePath: string | undefined): string | undefined {
  if (process.platform !== "win32" || !archivePath) return undefined;

  const executablePath = join(dirname(archivePath), "FieldsOfMistria.exe");
  if (!existsSync(executablePath)) return undefined;

  const escapedPath = executablePath.replaceAll("'", "''");
  const productVersion = execFileSync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-Item -LiteralPath '${escapedPath}').VersionInfo.ProductVersion`,
    ],
    { encoding: "utf8" },
  ).trim();

  return /^\d+\.\d+\.\d+$/.test(productVersion) ? productVersion : undefined;
}

function defaultInput(): string {
  if (existsSync(DEFAULT_WINDOWS_GAME_ARCHIVE)) return DEFAULT_WINDOWS_GAME_ARCHIVE;
  return "input/assets";
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
