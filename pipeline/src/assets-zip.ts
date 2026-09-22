import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Fields of Mistria's default Steam install location on Windows, the only platform the game ships
 * on. Used as a last-resort fallback so `pnpm run pipeline` works with no arguments and no
 * `MISTRIA_ASSETS` on a stock Windows dev machine.
 */
export const DEFAULT_WINDOWS_STEAM_ASSETS_DIR =
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Fields of Mistria";

/**
 * Finds `assets.zip` alongside or one level above `assetsDir`, the two shapes callers pass: the
 * Steam install directory itself (zip is a direct child) or an assets root one level below it.
 * Returns `undefined` when neither location has the file, e.g. when the caller already has an
 * extracted `fiddle/` on disk instead.
 */
export function resolveAssetsZipPath(assetsDir: string): string | undefined {
  const candidates = [resolve(assetsDir, "assets.zip"), resolve(assetsDir, "..", "assets.zip")];
  return candidates.find((p) => existsSync(p));
}
