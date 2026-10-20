import "#scripts/lib/require-pinned-node";

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Fails when an English message changes in a PR but a locale's value for the same key does not
 * (#105), run as `pnpm run check:locale-sync [--base <ref>]`.
 *
 * The key-shape check (`check:i18n`) only proves every locale has every key; it cannot tell that a
 * translation went stale because the English wording beside it changed. This check compares the
 * merge base of `--base` (default `origin/main`) & HEAD with the working tree: a key whose English
 * value changed must change in each locale too, or be listed in `locale-sync-allowlist.json` with
 * a reason. Added & removed keys are the key-shape check's concern, not this one's.
 */

const ROOT = path.join(import.meta.dirname, "..");
const MESSAGES_DIRECTORY = "messages";
const BASE_LOCALE = "en";
const ALLOWLIST_PATH = path.join(import.meta.dirname, "locale-sync-allowlist.json");

/** A locale's value for one key that may stay unchanged although the English value changed. */
export interface AllowlistEntry {
  key: string;
  locale: string;
  reason: string;
}

/** Flattened message values (`nested.key` paths), serialized so variant arrays compare by content. */
export type MessageMap = ReadonlyMap<string, string>;

/** One locale file at the merge base & in the working tree; a file absent at the base is empty. */
export interface LocaleVersions {
  base: MessageMap;
  head: MessageMap;
}

export interface StaleKey {
  key: string;
  locale: string;
}

/** Flattens a parsed message file, dropping the `$schema` marker. */
export function flattenMessages(parsed: unknown, prefix = ""): Map<string, string> {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return new Map([[prefix, JSON.stringify(parsed)]]);
  }
  const flattened = new Map<string, string>();
  for (const [key, nested] of Object.entries(parsed)) {
    if (prefix === "" && key === "$schema") continue;
    for (const [flatKey, value] of flattenMessages(
      nested,
      prefix === "" ? key : `${prefix}.${key}`,
    )) {
      flattened.set(flatKey, value);
    }
  }
  return flattened;
}

/** Validates the checked-in allowlist: every entry names a key & locale & says why. */
export function parseAllowlist(parsed: unknown): AllowlistEntry[] {
  if (!Array.isArray(parsed)) throw new Error("locale-sync-allowlist.json must be an array.");
  return parsed.map((entry: unknown, index) => {
    const { key, locale, reason } = (entry ?? {}) as Record<string, unknown>;
    for (const [name, value] of Object.entries({ key, locale, reason })) {
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`locale-sync-allowlist.json entry ${index} needs a non-empty "${name}".`);
      }
    }
    return { key, locale, reason } as AllowlistEntry;
  });
}

/**
 * The (key, locale) pairs where the English value changed, the locale still has the key, & its
 * value is the one it had at the base. A locale that added the key or changed its value passes, as
 * does one the allowlist names. Sorted by locale, then key.
 */
export function findStaleKeys(
  english: LocaleVersions,
  locales: Readonly<Record<string, LocaleVersions>>,
  allowlist: readonly AllowlistEntry[] = [],
): StaleKey[] {
  const changed = [...english.head]
    .filter(([key, value]) => english.base.has(key) && english.base.get(key) !== value)
    .map(([key]) => key);
  const allowed = new Set(allowlist.map(({ key, locale }) => JSON.stringify([locale, key])));
  const stale: StaleKey[] = [];
  for (const [locale, { base, head }] of Object.entries(locales)) {
    for (const key of changed) {
      if (!head.has(key) || !base.has(key) || head.get(key) !== base.get(key)) continue;
      if (allowed.has(JSON.stringify([locale, key]))) continue;
      stale.push({ key, locale });
    }
  }
  return stale.toSorted((a, b) => compareText(a.locale, b.locale) || compareText(a.key, b.key));
}

/** Code-unit order, so the report never depends on the machine's locale. */
function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readBase(root: string, mergeBase: string, locale: string): Map<string, string> {
  // Git pathspecs are `/`-separated on every platform.
  const file = path.posix.join(MESSAGES_DIRECTORY, `${locale}.json`);
  let text: string;
  try {
    text = git(root, ["show", `${mergeBase}:${file}`]);
  } catch {
    return new Map();
  }
  return flattenMessages(JSON.parse(text));
}

function readHead(root: string, locale: string): Map<string, string> {
  const text = readFileSync(path.join(root, MESSAGES_DIRECTORY, `${locale}.json`), "utf8");
  return flattenMessages(JSON.parse(text));
}

/** Stale keys between the merge base of `baseRef` & HEAD and the working tree under `root`. */
export function checkLocaleSync(
  baseRef: string,
  allowlist: readonly AllowlistEntry[],
  root = ROOT,
): StaleKey[] {
  const mergeBase = git(root, ["merge-base", baseRef, "HEAD"]).trim();
  const locales = readdirSync(path.join(root, MESSAGES_DIRECTORY))
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.basename(file, ".json"));
  const versions = (locale: string): LocaleVersions => ({
    base: readBase(root, mergeBase, locale),
    head: readHead(root, locale),
  });
  return findStaleKeys(
    versions(BASE_LOCALE),
    Object.fromEntries(
      locales
        .filter((locale) => locale !== BASE_LOCALE)
        .map((locale) => [locale, versions(locale)]),
    ),
    allowlist,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseFlag = process.argv.indexOf("--base");
  const baseRef = (baseFlag === -1 ? undefined : process.argv[baseFlag + 1]) ?? "origin/main";
  const allowlist = parseAllowlist(JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")));
  const stale = checkLocaleSync(baseRef, allowlist);
  if (stale.length === 0) {
    console.log(`No locale value is stale against a changed ${BASE_LOCALE}.json value.`);
  } else {
    console.error(
      `The ${BASE_LOCALE} value changed but the locale's did not (merge base of ${baseRef}):`,
    );
    for (const { key, locale } of stale) console.error(`  ${locale}: ${key}`);
    console.error(
      "\nUpdate each translation, or add the key & locale with a reason to scripts/locale-sync-allowlist.json.",
    );
    process.exitCode = 1;
  }
}
