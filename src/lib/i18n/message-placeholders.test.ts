import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { LOCALE_CODES } from "#lib/types/locale.js";

type Catalog = Record<string, unknown>;

function readCatalog(locale: string): Catalog {
  return JSON.parse(
    readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), "utf8"),
  ) as Catalog;
}

/** Every text a message can render: the string itself, or each plural variant's text. */
function variants(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: { match?: Record<string, string> }) =>
    Object.values(entry.match ?? {}),
  );
}

function placeholdersIn(text: string): Set<string> {
  return new Set([...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map(([, name]) => name));
}

/** Every placeholder any variant renders. */
function allPlaceholders(value: unknown): string {
  return [...new Set(variants(value).flatMap((text) => [...placeholdersIn(text)]))]
    .toSorted()
    .join(",");
}

/** The placeholders every English variant renders, so every translated variant must too. */
function requiredPlaceholders(value: unknown): string[] {
  const sets = variants(value).map((text) => placeholdersIn(text));
  const [first = new Set<string>(), ...rest] = sets;
  return [...first].filter((name) => rest.every((names) => names.has(name)));
}

const english = readCatalog("en");
const translatedLocales = LOCALE_CODES.filter((code) => code !== "en");
const keys = Object.keys(english).filter((key) => key !== "$schema");

// Placeholders carry values & `messageParts` slots (links, icons, key caps), so a translation that
// drops or renames one loses that content or throws at render time. The key-shape check doesn't
// look inside values, and the stale-translation check only compares against the base revision.
describe("message placeholders", () => {
  it.each(translatedLocales)("uses only English's placeholders in every %s message", (locale) => {
    const catalog = readCatalog(locale);
    const mismatches = keys.filter(
      (key) => allPlaceholders(catalog[key]) !== allPlaceholders(english[key]),
    );
    expect(mismatches).toEqual([]);
  });

  it.each(translatedLocales)(
    "keeps every required placeholder in each %s plural variant",
    (locale) => {
      const catalog = readCatalog(locale);
      const gaps = keys.flatMap((key) => {
        const required = requiredPlaceholders(english[key]);
        return variants(catalog[key]).flatMap((text, index) => {
          const present = placeholdersIn(text);
          const missing = required.filter((name) => !present.has(name));
          return missing.length > 0 ? [`${key}[${index}] lacks ${missing.join(", ")}`] : [];
        });
      });
      expect(gaps).toEqual([]);
    },
  );
});
