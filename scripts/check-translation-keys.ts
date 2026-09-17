// Verifies every messages/<locale>.json file has the same key shape as messages/en.json.
// Content is intentionally not compared: some translations are still machine-translated,
// works-in-progress, or (for short strings) legitimately identical across locales.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MESSAGES_DIR = path.join(import.meta.dirname, "..", "messages");
const BASE_LOCALE = "en";

export interface KeyMismatch {
  extraKeys: string[];
  locale: string;
  missingKeys: string[];
}

export async function checkTranslationKeys(messagesDir = MESSAGES_DIR): Promise<KeyMismatch[]> {
  const files = await readdir(messagesDir);
  const locales = files
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .filter((locale) => locale !== BASE_LOCALE);

  const baseKeys = await readMessageKeys(messagesDir, BASE_LOCALE);

  const mismatches: KeyMismatch[] = [];
  for (const locale of locales) {
    const localeKeys = await readMessageKeys(messagesDir, locale);
    const missingKeys = [...baseKeys].filter((key) => !localeKeys.has(key));
    const extraKeys = [...localeKeys].filter((key) => !baseKeys.has(key));
    if (missingKeys.length > 0 || extraKeys.length > 0) {
      mismatches.push({ extraKeys, locale, missingKeys });
    }
  }
  return mismatches;
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
  const raw = await readFile(path.join(messagesDir, `${locale}.json`), "utf-8");
  const parsed: unknown = JSON.parse(raw);
  return new Set(flattenKeys(parsed).filter((key) => key !== "$schema"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mismatches = await checkTranslationKeys();
  if (mismatches.length === 0) {
    console.log(`All locale files match the key shape of ${BASE_LOCALE}.json.`);
  } else {
    for (const { extraKeys, locale, missingKeys } of mismatches) {
      console.error(`\n${locale}.json:`);
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
