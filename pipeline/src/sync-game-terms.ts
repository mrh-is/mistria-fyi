import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  findGameTermDrift,
  readGameTermsConfig,
  resolveGameTerms,
  syncGameTerms,
} from "./game-terms.js";

const PIPELINE_ROOT = resolve(import.meta.dirname, "..");
const MESSAGES_DIR = resolve(PIPELINE_ROOT, "..", "messages");

/**
 * Copies the game's own UI vocabulary into MFG's Paraglide messages, per `messages/game-terms.json`.
 * `--check` reports drift without writing, for CI and pre-commit use.
 */
function main(): void {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const check = args.includes("--check");
  const assetsDir =
    args.find((a) => !a.startsWith("-")) ??
    process.env.MISTRIA_ASSETS ??
    resolve(PIPELINE_ROOT, "input", "assets");
  if (!existsSync(resolve(assetsDir, "fiddle"))) {
    console.error(`❌ Game assets not found at ${assetsDir}; pass the assets directory`);
    process.exit(1);
  }

  const { terms } = readGameTermsConfig(MESSAGES_DIR);
  const values = resolveGameTerms(assetsDir, terms);
  const drift = check
    ? findGameTermDrift(MESSAGES_DIR, values)
    : syncGameTerms(MESSAGES_DIR, values);

  for (const entry of drift) {
    console.log(
      `  ${entry.locale} ${entry.messageKey}: ${JSON.stringify(entry.actual)} → ${JSON.stringify(entry.expected)}`,
    );
  }
  const count = Object.keys(terms).length.toString();
  if (drift.length === 0) {
    console.log(`✅ ${count} game terms already match in every locale`);
  } else if (check) {
    console.error(
      `❌ ${drift.length.toString()} game terms drifted; run pnpm run i18n:sync-game-terms`,
    );
    process.exit(1);
  } else {
    console.log(
      `✅ Synced ${drift.length.toString()} of ${count} game terms; run pnpm run paraglide:compile`,
    );
  }
}

main();
