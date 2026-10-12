// Uploads the staged woff2 chunks from scripts/locale-fonts/build-locale-fonts.ts to the R2 bucket
// behind assets.mistria.fyi. Objects are keyed by family + version, so they are safe to mark
// immutable, and keys that already serve publicly are skipped (set FORCE=1 to re-upload
// everything). It lives outside scripts/locale-fonts/ because that directory is its own package,
// which hides the root `#scripts/*` import.
//
//   pnpm run fonts:upload [dist-dir]   (DRY_RUN=1 previews without uploading)
import "#scripts/lib/require-pinned-node";

import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { r2UploadOptionsFromEnv, r2UploadTree } from "#scripts/lib/r2-upload";

export async function uploadLocaleFonts(distDir: string): Promise<number> {
  // Keys are the paths under the dist dir (fonts/...).
  const fontsDir = path.join(distDir, "fonts");
  if (!existsSync(fontsDir)) {
    console.error(`No staged fonts in ${distDir}; run pnpm run fonts:build first.`);
    return 1;
  }
  const uploaded = await r2UploadTree(
    {
      contentType: "font/woff2",
      dir: fontsDir,
      extension: ".woff2",
      keyPrefix: "fonts/",
      skipMode: "exists",
    },
    r2UploadOptionsFromEnv(),
  );
  return uploaded ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const defaultDir = path.join(import.meta.dirname, "../.locale-fonts-dist");
  process.exitCode = await uploadLocaleFonts(process.argv[2] ?? defaultDir);
}
