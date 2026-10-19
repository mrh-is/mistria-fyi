/**
 * Inventories one game version's extracted assets, and optionally diffs it against another, into
 * the ignored `pipeline/output/asset-atlas/`. See docs/game-asset-format.md.
 */
import "../../../scripts/lib/require-pinned-node.js";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveCallerPath } from "../cli-options.js";
import { INPUT_ROOT, resolveVersionedAssetsDir } from "../parse/asset-input.js";
import { scanPipelineReferences } from "./claims.js";
import { assertInsideOutputRoot, parseAtlasCliOptions } from "./cli-options.js";
import { diffAtlases } from "./diff.js";
import { buildAtlas } from "./inventory.js";
import { renderAtlas, renderDiff } from "./render.js";

import type { AtlasCliOptions } from "./cli-options.js";
import type { AssetAtlas } from "./inventory.js";

const PIPELINE_SRC = fileURLToPath(new URL("..", import.meta.url));
const OUTPUT_ROOT = fileURLToPath(new URL("../../output", import.meta.url));
const DEFAULT_OUT_DIR = join(OUTPUT_ROOT, "asset-atlas");

function main(options: AtlasCliOptions): void {
  const root = options.assetsDir === undefined ? INPUT_ROOT : resolveCallerPath(options.assetsDir);
  const outDir =
    options.outDir === undefined
      ? DEFAULT_OUT_DIR
      : assertInsideOutputRoot(resolveCallerPath(options.outDir), OUTPUT_ROOT);
  const references = scanPipelineReferences(PIPELINE_SRC);
  mkdirSync(outDir, { recursive: true });

  const atlas = writeAtlas(root, options.version, references, outDir);
  if (options.compare === undefined) return;

  const compareDir = resolveVersionedAssetsDir(root, options.compare);
  if (compareDir === resolveVersionedAssetsDir(root, options.version)) {
    throw new Error(`--compare needs a game-files root with vX.Y.Z folders; ${root} has none.`);
  }
  const before = writeAtlas(root, options.compare, references, outDir);
  const diff = diffAtlases(before, atlas);
  const stem = `diff-v${diff.before}-v${diff.after}`;
  writeFileSync(join(outDir, `${stem}.json`), `${JSON.stringify(diff, null, 2)}\n`);
  writeFileSync(join(outDir, `${stem}.md`), renderDiff(diff));
  console.log(`Wrote ${join(outDir, `${stem}.md`)}`);
  console.log(
    `  ${diff.files.added.length} files added, ${diff.files.removed.length} removed; ` +
      `${diff.fiddle.changed.length} fiddle roots with changed keys`,
  );
}

function writeAtlas(
  root: string,
  version: string,
  references: Parameters<typeof buildAtlas>[2],
  outDir: string,
): AssetAtlas {
  const atlas = buildAtlas(resolveVersionedAssetsDir(root, version), version, references);
  writeFileSync(join(outDir, `v${version}.json`), `${JSON.stringify(atlas, null, 2)}\n`);
  writeFileSync(join(outDir, `v${version}.md`), renderAtlas(atlas));
  const claimed = atlas.fiddle.filter((file) => file.claims.length > 0).length;
  console.log(`Wrote ${join(outDir, `v${version}.md`)}`);
  console.log(`  ${atlas.fiddle.length} fiddle roots, ${claimed} claimed by the pipeline`);
  return atlas;
}

main(parseAtlasCliOptions(process.argv.slice(2)));
