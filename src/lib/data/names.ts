import { LOCALE_CODES } from "$lib/types/locale.js";

import type { LocaleCode } from "$lib/types/locale.js";
import type {
  DateId,
  FestivalId,
  NpcId,
  PerkId,
  PetCosmeticSetId,
  QuestId,
  SkillId,
  SpellId,
  StoreId,
} from "$lib/types/tracker-data.js";

/**
 * Categories whose player-facing names have been migrated out of `tracker-data.json` and into
 * per-locale chunks. Phase 4 extends this union as each remaining category is migrated; until
 * then, unmigrated categories still carry an inline `name` field on their `tracker-data` type.
 */
export type LocalizedCategory =
  | "dates"
  | "festivals"
  | "museum_wings"
  | "npcs"
  | "perks"
  | "pets/cosmetic_sets"
  | "quests"
  | "skills"
  | "spells"
  | "stores";

interface LocalizedCategoryId {
  dates: DateId;
  festivals: FestivalId;
  museum_wings: string;
  npcs: NpcId;
  perks: PerkId;
  "pets/cosmetic_sets": PetCosmeticSetId;
  quests: QuestId;
  skills: SkillId;
  spells: SpellId;
  stores: StoreId;
}
type NameChunk = Record<string, string>;

/**
 * Every generated chunk, keyed `<locale>/<category>`. The glob is eager so {@link getName} stays
 * synchronous — components resolve names inside `$derived` expressions, which can't await.
 *
 * All 8 locales ship in the bundle today. That's cheap at NPC scale (~5 KB total for 34 entries)
 * and is the measured baseline Phase 4 revisits before migrating the ~2,700-entry item category.
 */
const chunkModules = import.meta.glob<NameChunk>("./locales/**/*.json", {
  eager: true,
  import: "default",
});

const chunks = buildChunkIndex();
const collators = new Map<LocaleCode, Intl.Collator>();

/**
 * Resolves an entity's display name in `locale`, falling back to the English chunk whenever the
 * requested locale has no chunk for the category or no entry for the ID. Beta locales legitimately
 * miss keys; a missing *English* entry is a data bug and throws.
 *
 * `locale` is always an explicit argument sourced from route `load()` data. It is deliberately not
 * read from module-level state: SSR on Cloudflare Workers serves concurrent requests in different
 * locales from one module instance.
 */
export function getName<Category extends LocalizedCategory>(
  category: Category,
  id: LocalizedCategoryId[Category],
  locale: LocaleCode,
): string {
  const localized = chunks.get(chunkKey(locale, category))?.[id];
  if (localized !== undefined) return localized;

  const english = chunks.get(chunkKey("en", category))?.[id];
  if (english !== undefined) return english;

  throw new Error(`No "${category}" name for id "${id}" in locale "${locale}" or the en fallback`);
}

/** The whole `category` chunk for `locale`, English-merged. Use for bulk lookups (sorting, search). */
export function getNameTable<Category extends LocalizedCategory>(
  category: Category,
  locale: LocaleCode,
): Readonly<Record<LocalizedCategoryId[Category], string>> {
  const english = chunks.get(chunkKey("en", category)) ?? {};
  if (locale === "en") return english as Readonly<Record<LocalizedCategoryId[Category], string>>;
  return { ...english, ...chunks.get(chunkKey(locale, category)) } as Readonly<
    Record<LocalizedCategoryId[Category], string>
  >;
}

/**
 * A memoized `Intl.Collator` for `locale`, used wherever localized names are sorted or compared.
 * The cache is keyed by locale and holds immutable collators, so it carries no ambient locale
 * state between concurrent SSR requests.
 */
export function nameCollator(locale: LocaleCode): Intl.Collator {
  const cached = collators.get(locale);
  if (cached) return cached;

  const collator = new Intl.Collator(locale, { sensitivity: "base", usage: "sort" });
  collators.set(locale, collator);
  return collator;
}

function buildChunkIndex(): ReadonlyMap<string, NameChunk> {
  const locales: ReadonlySet<string> = new Set<string>(LOCALE_CODES);
  const index = new Map<string, NameChunk>();

  for (const [path, chunk] of Object.entries(chunkModules)) {
    const match = /^\.\/locales\/(?<locale>[^/]+)\/(?<category>.+)\.json$/.exec(path);
    if (!match?.groups) continue;

    const { category, locale } = match.groups;
    if (!locales.has(locale)) continue;

    index.set(chunkKey(locale as LocaleCode, category), chunk);
  }

  return index;
}

function chunkKey(locale: LocaleCode, category: string): string {
  return `${locale}/${category}`;
}
