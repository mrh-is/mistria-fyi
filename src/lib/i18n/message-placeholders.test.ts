import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { LOCALE_CODES } from "#lib/types/locale.js";

type Catalog = Record<string, unknown>;

function readCatalog(locale: string): Catalog {
  return JSON.parse(
    readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), "utf8"),
  ) as Catalog;
}

/** Every `{name}` a message's text can render, across all of its plural variants. */
function placeholders(value: unknown): string {
  const names = new Set<string>();
  for (const [, name] of JSON.stringify(value ?? "").matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)) {
    names.add(name);
  }
  return [...names].toSorted().join(",");
}

const english = readCatalog("en");
const translatedLocales = LOCALE_CODES.filter((code) => code !== "en");

// Placeholders carry values & `messageParts` slots (links, icons, key caps), so a translation that
// drops or renames one loses that content or throws at render time. The key-shape check doesn't
// look inside values, and the stale-translation check only compares against the base revision.
describe("message placeholders", () => {
  it.each(translatedLocales)("keeps English's placeholders in every %s message", (locale) => {
    const catalog = readCatalog(locale);
    const mismatches = Object.keys(english)
      .filter((key) => key !== "$schema")
      .filter((key) => placeholders(catalog[key]) !== placeholders(english[key]));
    expect(mismatches).toEqual([]);
  });
});
