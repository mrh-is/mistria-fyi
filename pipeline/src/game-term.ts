import "../../scripts/lib/require-pinned-node.js";

import { CURRENT_GAME_VERSION } from "./game-version.js";
import { searchGameTerms } from "./localize/game-term-search.js";
import { readTranslationTable } from "./localize/localize.js";
import { INPUT_ROOT, versionedAssetsDir } from "./parse/asset-input.js";

try {
  const query = process.argv
    .slice(2)
    .filter((arg, index) => index !== 0 || arg !== "--")
    .join(" ");
  const assetsDir = versionedAssetsDir(INPUT_ROOT, CURRENT_GAME_VERSION);
  const matches = searchGameTerms(query, (language, directory) =>
    readTranslationTable(assetsDir, language, directory),
  );
  if (matches.length === 0) {
    console.log(
      `No English matches in game ${CURRENT_GAME_VERSION} for ${JSON.stringify(query.trim())}.`,
    );
  }
  for (const { key, text } of matches) {
    console.log(key);
    for (const [locale, value] of Object.entries(text)) {
      console.log(`  ${locale}: ${value === null ? "(missing)" : JSON.stringify(value)}`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
