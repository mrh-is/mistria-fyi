/**
 * Audits sprite coverage from the generated tracker data: every Everything row without a sprite,
 * grouped by category, with why, and every Renown reward's sprite. Markdown on stdout.
 *
 *   pnpm run sprites:report                  rows without a sprite & the Renown rewards
 *   pnpm run sprites:report -- --staged      also checks each sprite against pipeline/output/sprites
 *   pnpm run sprites:report -- --remote      also checks each sprite against the production bucket
 *
 * Exits nonzero when a row has neither a sprite nor a no-art entry, or a checked sprite is missing.
 */
import "#scripts/lib/require-pinned-node";

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PRODUCTION_ASSET_ORIGIN } from "#lib/asset-origin.js";
import {
  everythingSpriteKeys,
  everythingSpriteRows,
  renownRewardSprites,
} from "#lib/sprites/everything-sprites.js";

import type { EverythingSpriteRow } from "#lib/sprites/everything-sprites.js";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REMOTE_CONCURRENCY = 16;

/** The report's Markdown: placeholder rows & gaps by category, then the Renown rewards. */
export function formatSpriteReport(
  rows: readonly EverythingSpriteRow[],
  renown: readonly { id: string; level: number; sprite?: { id: string; kind: string } }[],
  missingKeys: readonly string[] = [],
): string {
  const lines = ["# Sprite coverage", ""];
  const withArt = rows.filter(({ art }) => art?.kind === "sprite").length;
  lines.push(`${String(withArt)} of ${String(rows.length)} Everything rows have a sprite.`, "");

  const byCategory = Map.groupBy(
    rows.filter(({ art }) => art?.kind !== "sprite"),
    ({ category }) => category,
  );
  lines.push("## Rows without a sprite", "");
  if (byCategory.size === 0) lines.push("None.", "");
  for (const [category, categoryRows] of [...byCategory].toSorted(([a], [b]) =>
    a.localeCompare(b),
  )) {
    lines.push(`### ${category} (${String(categoryRows.length)})`, "");
    const byReason = Map.groupBy(categoryRows, ({ art }) =>
      art?.kind === "none" ? art.reason : "**Gap:** no sprite & no no-art entry.",
    );
    for (const [reason, reasonRows] of byReason) {
      lines.push(
        `- ${reason} (${String(reasonRows.length)})`,
        `  - ${reasonRows.map(({ id }) => `\`${id}\``).join(", ")}`,
      );
    }
    lines.push("");
  }

  lines.push("## Renown rewards", "");
  for (const { id, level, sprite } of renown) {
    lines.push(
      `- Level ${String(level)}: \`${id}\` → ${sprite ? `\`${sprite.kind}/${sprite.id}\`` : "no sprite"}`,
    );
  }
  lines.push("");

  if (missingKeys.length > 0) {
    lines.push(`## Missing sprite files (${String(missingKeys.length)})`, "");
    for (const key of missingKeys) lines.push(`- \`${key}\``);
    lines.push("");
  }
  return lines.join("\n");
}

function missingStaged(keys: readonly string[], spritesDir: string): string[] {
  return keys.filter((key) => !existsSync(join(spritesDir, `${key}.webp`)));
}

async function missingRemote(keys: readonly string[]): Promise<string[]> {
  const missing: string[] = [];
  const queue = [...keys];
  async function worker(): Promise<void> {
    for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each worker checks its keys in turn
      const response = await fetch(`${PRODUCTION_ASSET_ORIGIN}/sprites/${key}.webp`, {
        method: "HEAD",
      });
      if (!response.ok) missing.push(`${key} (HTTP ${String(response.status)})`);
    }
  }
  await Promise.all(Array.from({ length: REMOTE_CONCURRENCY }, worker));
  return missing.toSorted();
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const rows = everythingSpriteRows();
  const keys = everythingSpriteKeys();
  const missing = [
    ...(args.has("--staged")
      ? missingStaged(keys, join(REPO_ROOT, "pipeline/output/sprites"))
      : []),
    ...(args.has("--remote") ? await missingRemote(keys) : []),
  ];
  console.log(formatSpriteReport(rows, renownRewardSprites(), missing));
  if (rows.some(({ art }) => !art) || missing.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
