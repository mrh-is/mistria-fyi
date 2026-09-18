import type { LocaleCode } from "$lib/types/locale.js";
import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  DateId,
  FestivalId,
  ItemId,
  MinesBiomeId,
  NpcId,
  PerkId,
  PetCosmeticSetId,
  PetSkinId,
  QuestId,
  RecipeId,
  SkillId,
  SpellId,
  StoreId,
  TreasureChestTierId,
} from "$lib/types/tracker-data.js";

export type AnimalNameId = string & { readonly __brand: "AnimalNameId" };

/**
 * Categories whose player-facing names have been migrated out of `tracker-data.json` and into
 * per-locale chunks. Phase 4 extends this union as each remaining category is migrated; until
 * then, unmigrated categories still carry an inline `name` field on their `tracker-data` type.
 */
export const LOCALIZED_CATEGORIES = [
  "animals",
  "cosmetics",
  "dates",
  "festivals",
  "items",
  "mines",
  "museum_wings",
  "npcs",
  "perks",
  "pets/cosmetic_sets",
  "pets/skins",
  "quests",
  "recipes",
  "skills",
  "spells",
  "stores",
  "town-ranks",
  "treasure-chest-tiers",
] as const;
export type LocalizedCategory = (typeof LOCALIZED_CATEGORIES)[number];

interface LocalizedCategoryId {
  animals: AnimalNameId;
  cosmetics: CosmeticId;
  dates: DateId;
  festivals: FestivalId;
  items: ItemId;
  mines: MinesBiomeId;
  museum_wings: string;
  npcs: NpcId;
  perks: PerkId;
  "pets/cosmetic_sets": PetCosmeticSetId;
  "pets/skins": PetSkinId;
  quests: QuestId;
  recipes: RecipeId;
  skills: SkillId;
  spells: SpellId;
  stores: StoreId;
  "town-ranks": string;
  "treasure-chest-tiers": TreasureChestTierId;
}
type NameChunk = Record<string, string>;

/**
 * Every generated chunk, keyed `./locales/<locale>/<category>.json`, as a lazy loader. Each chunk
 * becomes its own code-split module, so a route only fetches the categories it renders, in the
 * locale it renders them, rather than every category in all 8 locales on every page load (the
 * eager baseline was ~2 MB raw once items migrated).
 *
 * {@link getName} and {@link getNameTable} stay synchronous — components resolve names inside
 * `$derived` expressions, which can't await — and read from {@link chunks}, which
 * {@link loadNames} populates. A route's `load()` awaits the chunks its page needs before the
 * page renders; sitewide search awaits every category on first open.
 */
const chunkLoaders: Partial<Record<string, () => Promise<NameChunk>>> = import.meta.glob<NameChunk>(
  "./locales/**/*.json",
  { import: "default" },
);

/** Resolved chunks, keyed `<locale>/<category>`. Shared across SSR requests: it's an immutable cache. */
const chunks = new Map<string, NameChunk>();
/** One in-flight or settled load per chunk key, so concurrent callers share a single import. */
const chunkLoads = new Map<string, Promise<void>>();
const collators = new Map<LocaleCode, Intl.Collator>();

/** Path-qualified keys mirror the nested ranching localization paths, preventing cross-species ID collisions. */
export function animalNameId(
  animalId: AnimalId,
  section: "core" | "cosmetics" | "variants",
  id?: AnimalVariantId | CosmeticId,
): AnimalNameId {
  return `${animalId}/${section}${id ? `/${id}` : ""}` as AnimalNameId;
}

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
  const localized = readChunk(locale, category)?.[id];
  if (localized !== undefined) return localized;

  const english = readChunk("en", category)?.[id];
  if (english !== undefined) return english;

  throw new Error(`No "${category}" name for id "${id}" in locale "${locale}" or the en fallback`);
}

/** The whole `category` chunk for `locale`, English-merged. Use for bulk lookups (sorting, search). */
export function getNameTable<Category extends LocalizedCategory>(
  category: Category,
  locale: LocaleCode,
): Readonly<Record<LocalizedCategoryId[Category], string>> {
  const english = readChunk("en", category) ?? {};
  if (locale === "en") return english as Readonly<Record<LocalizedCategoryId[Category], string>>;
  return { ...english, ...readChunk(locale, category) } as Readonly<
    Record<LocalizedCategoryId[Category], string>
  >;
}

/** Whether every chunk {@link loadNames} would fetch for these arguments is already resident. */
export function hasNames(locale: LocaleCode, categories: readonly LocalizedCategory[]): boolean {
  return categories.every(
    (category) => isChunkReady("en", category) && isChunkReady(locale, category),
  );
}

/**
 * Loads `categories` for `locale` plus their English fallback chunks, caching each for the
 * session. Resolves once every synchronous {@link getName} call for those categories can succeed.
 * Repeat calls for already-loaded chunks resolve immediately without a second fetch.
 */
export function loadNames(
  locale: LocaleCode,
  categories: readonly LocalizedCategory[],
): Promise<void> {
  const loads: Promise<void>[] = [];
  for (const category of categories) {
    loads.push(loadChunk("en", category));
    if (locale !== "en") loads.push(loadChunk(locale, category));
  }
  return Promise.all(loads).then(() => undefined);
}

/**
 * Awaits the name chunks a page renders, in the locale the root layout resolved. For use from a
 * route's `load()`: pass its event through. The sitemap generator calls page `load()`s with no
 * event to harvest metadata; nothing renders there, so nothing needs loading.
 */
export async function loadPageNames(
  event: undefined | { parent?: () => Promise<{ locale: LocaleCode }> },
  categories: readonly LocalizedCategory[],
): Promise<void> {
  if (!event?.parent) return;
  const { locale } = await event.parent();
  await loadNames(locale, categories);
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

function chunkKey(locale: LocaleCode, category: string): string {
  return `${locale}/${category}`;
}

function chunkPath(locale: LocaleCode, category: LocalizedCategory): string {
  return `./locales/${locale}/${category}.json`;
}

/** A chunk that was never generated for this locale is "ready" in the sense that there is nothing to await. */
function isChunkReady(locale: LocaleCode, category: LocalizedCategory): boolean {
  return !(chunkPath(locale, category) in chunkLoaders) || chunks.has(chunkKey(locale, category));
}

function loadChunk(locale: LocaleCode, category: LocalizedCategory): Promise<void> {
  const key = chunkKey(locale, category);
  const loader = chunkLoaders[chunkPath(locale, category)];
  if (!loader) return Promise.resolve();

  let load = chunkLoads.get(key);
  if (!load) {
    load = loader().then((chunk) => {
      chunks.set(key, chunk);
    });
    // A failed import must not poison the cache: drop it so the next caller retries the fetch.
    load.catch(() => chunkLoads.delete(key));
    chunkLoads.set(key, load);
  }
  return load;
}

/**
 * The resident chunk for `locale`/`category`, or `undefined` when the pipeline never generated
 * one (beta locales legitimately lack categories, and English then covers them). A chunk that
 * exists but hasn't been loaded is a programming error — the route's `load()` forgot to await it —
 * and throws rather than silently degrading to English.
 */
function readChunk(locale: LocaleCode, category: LocalizedCategory): NameChunk | undefined {
  const key = chunkKey(locale, category);
  const chunk = chunks.get(key);
  if (chunk) return chunk;
  if (!(chunkPath(locale, category) in chunkLoaders)) return undefined;
  throw new Error(
    `Name chunk "${key}" is not loaded; await loadNames("${locale}", ["${category}"]) before resolving names`,
  );
}
