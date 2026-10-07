import type { AcquisitionReferenceRegistries } from "../acquisition/reference-index.js";

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
  // `src/lib/sources/source-segments.ts`.
  monsters: ["any"],
} as const satisfies AcquisitionReferenceRegistries;
