import "#scripts/lib/require-pinned-node";

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Fails when an English message changes in a PR but a locale’s value for the same key does not
 * (#105), run as `pnpm run check:locale-sync [-- --base <ref>]`.
 *
 * The key-shape check (`check:i18n`) only proves every locale has every key; it cannot tell that a
 * translation went stale because the English wording beside it changed. This check compares the
 * merge base of `--base` (default `origin/main`) & HEAD with the working tree: a key whose English
 * value changed must change in each locale too, or be listed in `locale-sync-allowlist.json` with
 * the English value it was reviewed against & a reason. Added & removed keys are the key-shape
 * check’s concern, not this one’s, so renaming a key & editing its English passes unnoticed.
 */

const MESSAGES_DIRECTORY = "messages";
const BASE_LOCALE = "en";
const ALLOWLIST_FILE = path.join("scripts", "locale-sync-allowlist.json");
const DEFAULT_BASE = "origin/main";

/**
 * A locale value that may stay unchanged although the English value changed. It applies only while
 * the English value still equals `english`, so a later edit to the English text is checked again.
 */
export interface AllowlistEntry {
  /** The English text the exception was reviewed against. */
  english: string;
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

/** Validates the checked-in allowlist: every entry names a key, locale, English text, & reason. */
export function parseAllowlist(parsed: unknown): AllowlistEntry[] {
  if (!Array.isArray(parsed)) throw new Error("locale-sync-allowlist.json must be an array.");
  return parsed.map((entry: unknown, index) => {
    const { english, key, locale, reason } = (entry ?? {}) as Record<string, unknown>;
    for (const [name, value] of Object.entries({ english, key, locale, reason })) {
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`locale-sync-allowlist.json entry ${index} needs a non-empty "${name}".`);
      }
    }
    return { english, key, locale, reason } as AllowlistEntry;
  });
}

/**
 * Problems with the allowlist itself: an entry whose key is missing from English or whose locale
 * has no file, so it can never apply. (An entry whose English text no longer matches is not a
 * problem; it simply stops applying, & the key is checked again.)
 */
export function findAllowlistProblems(
  english: LocaleVersions,
  locales: Readonly<Record<string, LocaleVersions>>,
  allowlist: readonly AllowlistEntry[],
): string[] {
  const problems: string[] = [];
  for (const { key, locale } of allowlist) {
    if (!english.head.has(key)) {
      problems.push(
        `allowlist entry ${locale}: ${key} names a key that is not in ${BASE_LOCALE}.json`,
      );
    }
    if (!Object.hasOwn(locales, locale)) {
      problems.push(`allowlist entry ${locale}: ${key} names a locale with no messages file`);
    }
  }
  return problems;
}

/**
 * The (key, locale) pairs where the English value changed, the locale still has the key, & its
 * value is the one it had at the base. A locale that added the key or changed its value passes, as
 * does one the allowlist names for the current English text. Sorted by locale, then key.
 */
export function findStaleKeys(
  english: LocaleVersions,
  locales: Readonly<Record<string, LocaleVersions>>,
  allowlist: readonly AllowlistEntry[] = [],
): StaleKey[] {
  const changed = [...english.head]
    .filter(([key, value]) => english.base.has(key) && english.base.get(key) !== value)
    .map(([key]) => key);
  const allowed = new Set(
    allowlist.map(({ english: text, key, locale }) => JSON.stringify([locale, key, text])),
  );
  const stale: StaleKey[] = [];
  for (const [locale, { base, head }] of Object.entries(locales)) {
    for (const key of changed) {
      if (!head.has(key) || !base.has(key) || head.get(key) !== base.get(key)) continue;
      const currentEnglish = JSON.parse(english.head.get(key) ?? "null") as unknown;
      if (allowed.has(JSON.stringify([locale, key, currentEnglish]))) continue;
      stale.push({ key, locale });
    }
  }
  return stale.toSorted((a, b) => compareText(a.locale, b.locale) || compareText(a.key, b.key));
}

/** Code-unit order, so the report never depends on the machine’s locale. */
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

/** The locale file at the merge base; absent only when the tree there has no such path. */
function readBase(root: string, mergeBase: string, locale: string): Map<string, string> {
  // Git pathspecs are `/`-separated on every platform.
  const file = path.posix.join(MESSAGES_DIRECTORY, `${locale}.json`);
  // `ls-tree` prints nothing for a missing path & fails (rather than printing nothing) on a bad
  // commit, so only a genuinely absent file is treated as empty.
  if (git(root, ["ls-tree", "--name-only", mergeBase, "--", file]).trim() === "") {
    return new Map();
  }
  return flattenMessages(JSON.parse(git(root, ["show", `${mergeBase}:${file}`])));
}

function readHead(root: string, locale: string): Map<string, string> {
  const text = readFileSync(path.join(root, MESSAGES_DIRECTORY, `${locale}.json`), "utf8");
  return flattenMessages(JSON.parse(text));
}

export interface LocaleSyncResult {
  allowlistProblems: string[];
  stale: StaleKey[];
}

/** Stale keys between the merge base of `baseRef` & HEAD and the working tree under `root`. */
export function checkLocaleSync(
  baseRef: string,
  allowlist: readonly AllowlistEntry[],
  root: string,
): LocaleSyncResult {
  let mergeBase: string;
  try {
    mergeBase = git(root, ["merge-base", baseRef, "HEAD"]).trim();
  } catch {
    throw new Error(
      `Cannot find a merge base between "${baseRef}" & HEAD. Fetch the base branch ` +
        "(`git fetch origin main`) or pass another ref with --base <ref>.",
    );
  }
  const locales = readdirSync(path.join(root, MESSAGES_DIRECTORY))
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.basename(file, ".json"));
  const versions = (locale: string): LocaleVersions => ({
    base: readBase(root, mergeBase, locale),
    head: readHead(root, locale),
  });
  const english = versions(BASE_LOCALE);
  const others = Object.fromEntries(
    locales.filter((locale) => locale !== BASE_LOCALE).map((locale) => [locale, versions(locale)]),
  );
  return {
    allowlistProblems: findAllowlistProblems(english, others, allowlist),
    stale: findStaleKeys(english, others, allowlist),
  };
}

/** The `--base` ref: `--base <ref>` or `--base=<ref>`, defaulting to `origin/main`. */
export function parseBaseRef(argv: readonly string[]): string {
  let baseRef = DEFAULT_BASE;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--") continue;
    if (arg.startsWith("--base=")) {
      baseRef = arg.slice("--base=".length);
    } else if (arg === "--base") {
      index += 1;
      baseRef = argv[index] ?? "";
    } else {
      throw new Error(`Unknown argument "${arg}". Usage: check-locale-sync [--base <ref>]`);
    }
    if (baseRef === "" || baseRef.startsWith("--")) {
      throw new Error("--base needs a ref, for example --base origin/main.");
    }
  }
  return baseRef;
}

function main(): number {
  try {
    const baseRef = parseBaseRef(process.argv.slice(2));
    const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
    const allowlist = parseAllowlist(
      JSON.parse(readFileSync(path.join(root, ALLOWLIST_FILE), "utf8")),
    );
    const { allowlistProblems, stale } = checkLocaleSync(baseRef, allowlist, root);
    if (stale.length === 0 && allowlistProblems.length === 0) {
      console.log(`No locale value is stale against a changed ${BASE_LOCALE}.json value.`);
      return 0;
    }
    if (stale.length > 0) {
      console.error(
        `The ${BASE_LOCALE} value changed but the locale’s did not (merge base of ${baseRef}):`,
      );
      for (const { key, locale } of stale) console.error(`  ${locale}: ${key}`);
      console.error(
        `\nUpdate each translation, or add the key, locale, current English text, & a reason to ${ALLOWLIST_FILE.replaceAll("\\", "/")}.`,
      );
    }
    for (const problem of allowlistProblems) console.error(problem);
    return 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
