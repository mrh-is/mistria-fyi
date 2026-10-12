// Uploads staged sprites (pnpm run pipeline -- <path> --sprites) to the R2 bucket behind
// assets.mistria.fyi. Objects are keyed by stable entity ID (sprites/items/<id>.webp,
// sprites/villagers/<id>.webp), overwritten in place rather than versioned, so a no-change run must
// not re-upload: a key is skipped when its remote ETag already matches the local file's MD5 (set
// FORCE=1 to re-upload everything regardless).
//
// Sprites are uploaded with a revalidating Cache-Control (one day, then stale-while-revalidate) so
// a takedown reaches returning visitors; see docs/takedown.md. Objects uploaded earlier with the
// old one-year immutable policy keep it until re-uploaded, so run once with FORCE=1 to migrate them.
//
//   pnpm run sprites:upload [sprites-dir]   (DRY_RUN=1 previews without uploading)
import "#scripts/lib/require-pinned-node";

import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { listFiles, r2UploadOptionsFromEnv, r2UploadTree } from "#scripts/lib/r2-upload";

export const SPRITE_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=86400";

export async function uploadSprites(spritesDir: string): Promise<number> {
  if (!existsSync(spritesDir)) {
    console.error(
      `No staged sprites in ${spritesDir}; run pnpm run pipeline -- <path> --sprites first.`,
    );
    return 1;
  }
  // Original game assets must never reach the public bucket by accident: refuse to upload anything
  // that isn't a converted .webp sprite.
  const files = await listFiles(spritesDir);
  const nonWebp = files.filter((file) => !file.endsWith(".webp"));
  if (nonWebp.length > 0) {
    console.error(`Refusing to upload: ${spritesDir} contains non-.webp files:`);
    for (const file of nonWebp) {
      console.error(path.join(spritesDir, file));
    }
    return 1;
  }
  const uploaded = await r2UploadTree(
    {
      cacheControl: SPRITE_CACHE_CONTROL,
      contentType: "image/webp",
      dir: spritesDir,
      extension: ".webp",
      keyPrefix: "sprites/",
      skipMode: "etag",
    },
    r2UploadOptionsFromEnv(),
  );
  return uploaded ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const defaultDir = path.join(import.meta.dirname, "../../pipeline/output/sprites");
  process.exitCode = await uploadSprites(process.argv[2] ?? defaultDir);
}
