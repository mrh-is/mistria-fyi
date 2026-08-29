import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { ParsedGameData } from "./parse-fiddle.js";

const temporaryAssetsDirectories: string[] = [];

export function createAssetsFixture(files: Record<string, string>): string {
  const assetsDir = mkdtempSync(join(tmpdir(), "harvest-helper-assets-"));
  temporaryAssetsDirectories.push(assetsDir);

  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(assetsDir, "fiddle", relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }

  return assetsDir;
}

export function makeFiddle(overrides: Record<string, unknown> = {}): ParsedGameData {
  return overrides as unknown as ParsedGameData;
}

export function removeAssetsFixtures(): void {
  for (const directory of temporaryAssetsDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
}

export function requireGameAssetsDir(): string {
  const assetsDir = process.env.MISTRIA_ASSETS ?? "pipeline/input/assets";
  const fiddleDir = join(assetsDir, "fiddle");
  if (!existsSync(fiddleDir)) {
    throw new Error(
      `Game assets not found at ${fiddleDir}. Set MISTRIA_ASSETS to the assets directory.`,
    );
  }
  return assetsDir;
}
