import { LOCALE_CODES } from "#lib/types/locale.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { LocationId } from "#lib/types/tracker-data.js";

import type { Localizer } from "../localize.js";
import type { ParsedGameData } from "../parse-fiddle.js";

/**
 * Localized names for every `locations.toml` entry that carries one. Unnamed entries (`farm`,
 * interiors, & the like) have no `locations/<id>/name` key; the app names the few that sources
 * reference itself. `default` holds the game's placeholder name and is skipped.
 */
export function extractLocationNames(
  fiddle: ParsedGameData,
  localizer: Localizer,
): Record<LocaleCode, Record<LocationId, string>> {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<LocationId, string>
  >;
  const locations = fiddle.locations as Record<string, Record<string, unknown>> | undefined;
  if (!locations) throw new Error("The fiddle has no locations table");

  for (const [id, location] of Object.entries(locations)) {
    if (id === "default" || typeof location.name !== "string") continue;
    const { values } = localizer.localizeField({
      category: "locations",
      classification: "localizable",
      englishValue: location.name,
      field: "name",
      id,
    });
    for (const locale of LOCALE_CODES) localeNames[locale][id as LocationId] = values[locale];
  }

  console.log(`  Location names: ${Object.keys(localeNames.en).length}`);
  return localeNames;
}
