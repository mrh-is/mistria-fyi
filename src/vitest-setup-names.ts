import { loadNames, LOCALIZED_CATEGORIES } from "#lib/data/names.js";
import { LOCALE_CODES } from "#lib/types/locale.js";

// The app awaits name chunks in each route's `load()` before anything calls `getName`. Tests call
// engine functions and mount components directly, with no route in front of them, so every chunk
// is loaded up front here instead. Tests of the loading boundary itself run under
// the `mocked` Vitest project, which skips this file.
await Promise.all(LOCALE_CODES.map((locale) => loadNames(locale, LOCALIZED_CATEGORIES)));
