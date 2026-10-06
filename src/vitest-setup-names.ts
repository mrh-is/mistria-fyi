import { loadNames, NAME_CHUNKS } from "#lib/data/names.js";

// Most app and client tests use English names. A few exercise Japanese rendering, so keep both
// locales ready before a test imports its component. Full-locale assertions load the remaining
// chunks explicitly in their own suites. Each isolated test file gets a fresh name cache.
await Promise.all((["en", "ja"] as const).map((locale) => loadNames(locale, NAME_CHUNKS)));
