import type { AcquisitionReferenceRegistries } from "./reference-index.js";

/**
 * IDs that reviewed overrides use deliberately although no parsed game table defines them. The
 * validator accepts these and nothing else outside the parsed registries, so a misspelled override
 * still fails. Adding an ID here is a reviewed decision; never derive entries from sources.
 */
export const REVIEWED_NON_NATIVE_REFERENCES = {
  // `void_herb` forages in every Mines biome; no single `locations.toml` entry spans them. The app
  // names it through the `source_location_mines` message.
  locations: ["mines"],
  // A wildcard for drops from every monster, rendered as “any monster” by `monsterName` in
  // `src/lib/utils/source-segments.ts`.
  monsters: ["any"],
  // Runtime-only story beats (items, songs, & flags) that are not quests or cutscenes. Each must
  // also appear in `UNNAMED_SOURCE_IDS.quests` (`src/lib/utils/source-names.ts`) so it renders;
  // #471 tracks giving them reviewed names.
  quests: [
    "another_tower",
    "balors_crate",
    "beach_date_unlock",
    "elsies_dating_tutorial",
    "gem_cutting_date_unlock",
    "park_date_unlock",
    "ryis_lumber",
  ],
} as const satisfies AcquisitionReferenceRegistries;
