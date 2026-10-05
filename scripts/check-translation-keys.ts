// Verifies every messages/<locale>.json file has the same key shape as messages/en.json.
// Content is intentionally not compared: some translations are still machine-translated,
// works-in-progress, or (for short strings) legitimately identical across locales.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MESSAGES_DIR = path.join(import.meta.dirname, "..", "messages");
const SETTINGS_PATH = path.join(import.meta.dirname, "..", "project.inlang", "settings.json");
const BASE_LOCALE = "en";

export interface KeyMismatch {
  extraKeys: string[];
  /** The locale is declared in project.inlang/settings.json but messages/<locale>.json is absent. */
  fileMissing?: boolean;
  locale: string;
  missingKeys: string[];
  /** messages/<locale>.json exists but the locale isn't declared in project.inlang/settings.json. */
  undeclared?: boolean;
}

export async function checkTranslationKeys(
  messagesDir = MESSAGES_DIR,
  locales?: string[],
): Promise<KeyMismatch[]> {
  const configuredLocales = locales ?? (await readConfiguredLocales());
  const files = await readdir(messagesDir);
  const fileLocales = new Set(
    files.filter((file) => file.endsWith(".json")).map((file) => file.replace(/\.json$/, "")),
  );

  const baseKeys = await readMessageKeys(messagesDir, BASE_LOCALE);

  const localeResults = await Promise.all(
    configuredLocales
      .filter((locale) => locale !== BASE_LOCALE)
      .map(async (locale): Promise<KeyMismatch | undefined> => {
        if (!fileLocales.has(locale)) {
          return { extraKeys: [], fileMissing: true, locale, missingKeys: [] };
        }
        const localeKeys = await readMessageKeys(messagesDir, locale);
        const missingKeys = [...baseKeys].filter((key) => !localeKeys.has(key));
        const extraKeys = [...localeKeys].filter((key) => !baseKeys.has(key));
        if (missingKeys.length > 0 || extraKeys.length > 0) {
          return { extraKeys, locale, missingKeys };
        }
        return undefined;
      }),
  );
  const mismatches: KeyMismatch[] = localeResults.filter((result) => result !== undefined);

  const configuredSet = new Set(configuredLocales);
  for (const locale of fileLocales) {
    if (locale === BASE_LOCALE || configuredSet.has(locale)) continue;
    mismatches.push({ extraKeys: [], locale, missingKeys: [], undeclared: true });
  }

  return mismatches;
}

export async function readConfiguredLocales(settingsPath = SETTINGS_PATH): Promise<string[]> {
  const raw = await readFile(settingsPath, "utf8");
  const parsed = JSON.parse(raw) as { locales: string[] };
  return parsed.locales;
}

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, nested]) =>
    flattenKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

async function readMessageKeys(messagesDir: string, locale: string): Promise<Set<string>> {
  const raw = await readFile(path.join(messagesDir, `${locale}.json`), "utf8");
  const parsed: unknown = JSON.parse(raw);
  return new Set(flattenKeys(parsed).filter((key) => key !== "$schema"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mismatches = await checkTranslationKeys();
  if (mismatches.length === 0) {
    console.log(`All locale files match the key shape of ${BASE_LOCALE}.json.`);
  } else {
    for (const { extraKeys, fileMissing, locale, missingKeys, undeclared } of mismatches) {
      console.error(`\n${locale}.json:`);
      if (fileMissing) {
        console.error(
          `  missing: file not found (locale is declared in project.inlang/settings.json)`,
        );
        continue;
      }
      if (undeclared) {
        console.error(
          `  extra:   file exists but locale is not declared in project.inlang/settings.json`,
        );
        continue;
      }
      for (const key of missingKeys) {
        console.error(`  missing: ${key}`);
      }
      for (const key of extraKeys) {
        console.error(`  extra:   ${key}`);
      }
    }
    process.exitCode = 1;
  }
}
