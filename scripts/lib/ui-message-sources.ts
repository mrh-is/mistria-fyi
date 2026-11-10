import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { SourceCatalog } from "./compile-ui-catalog.js";

export const FEATURE_CATALOGS = "features";

/** Inverts the authored feature shards into a lookup per locale for build and CI consumers. */
export function readUiMessageSources(
  directory: string,
  expectedLocales?: readonly string[],
  watch?: (file: string) => void,
): Record<string, SourceCatalog> {
  const featureDir = path.join(directory, FEATURE_CATALOGS);
  const result: Record<string, SourceCatalog> = {};
  const keys = new Set<string>();
  let locales = expectedLocales;
  for (const filename of readdirSync(featureDir)
    .filter((file) => file.endsWith(".json"))
    .toSorted()) {
    const file = path.join(featureDir, filename);
    watch?.(file);
    const feature = path.basename(filename, ".json");
    const catalog = JSON.parse(readFileSync(file, "utf8")) as Record<string, SourceCatalog>;
    for (const [key, translations] of Object.entries(catalog)) {
      if (!/^[a-z][a-z0-9_]*$/u.test(key) || key.split("_", 1)[0] !== feature || keys.has(key)) {
        throw new Error(`Unexpected or duplicate UI key ${key} in ${filename}`);
      }
      keys.add(key);
      locales ??= Object.keys(translations);
      if (!locales.includes("en") || Object.keys(translations).length !== locales.length) {
        throw new Error(`Wrong locale set for ${key} in ${filename}`);
      }
      for (const locale of locales) {
        if (!Object.hasOwn(translations, locale)) {
          throw new Error(`Missing ${locale} translation for ${key} in ${filename}`);
        }
        (result[locale] ??= {})[key] = translations[locale];
      }
    }
  }
  if (keys.size === 0) throw new Error("The UI feature catalogs contain no messages");
  return result;
}
