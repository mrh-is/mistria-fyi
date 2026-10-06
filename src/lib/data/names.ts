import type { LocaleCode } from "#lib/types/locale.js";
import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  DateId,
  FestivalId,
  ItemId,
  MinesBiomeId,
  PerkId,
  PetCosmeticSetId,
  PetSkinId,
  QuestId,
  RecipeId,
  SkillId,
  SpellId,
  StoreId,
  TreasureChestTierId,
  VillagerId,
} from "#lib/types/tracker-data.js";

export type AnimalNameId = string & { readonly __brand: "AnimalNameId" };

/**
 * Categories whose player-facing names live in per-locale chunks, not in `tracker-data.json`.
 * Every named category is migrated; none carries an inline `name` field on its `tracker-data` type.
 */
export const NAME_CHUNKS = [
  "animals",
  "cosmetics",
  "cosmetics/subcategories",
  "dates",
  "festivals",
  "items",
  "mines",
  "museum_wings",
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
  "ui",
  "villagers",
] as const;
export type NameChunk = (typeof NAME_CHUNKS)[number];

interface LocalizedCategoryId {
  animals: AnimalNameId;
  cosmetics: CosmeticId;
  "cosmetics/subcategories": string;
  dates: DateId;
  festivals: FestivalId;
  items: ItemId;
  mines: MinesBiomeId;
  museum_wings: string;
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
  /** Game UI vocabulary keyed by `misc_local` key: almanac categories, `tier_<n>`, etc. */
  ui: string;
  villagers: VillagerId;
}
type NameChunkContents = Partial<Record<string, string>>;

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
const chunkLoaders: Partial<Record<string, () => Promise<NameChunkContents>>> =
  import.meta.glob<NameChunkContents>("./locales/**/*.json", { import: "default" });

/** Resolved chunks, keyed `<locale>/<category>`. Shared across SSR requests: it's an immutable cache. */
const chunks = new Map<string, NameChunkContents>();
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
 * Resolves an entity's display name in `locale`. The pipeline fills every locale's chunk with
 * English for any key the game doesn't translate, so each chunk is key-complete and there is no
 * runtime English fallback: a missing entry is a data bug and throws.
 *
 * `locale` is always an explicit argument sourced from route `load()` data. It is deliberately not
 * read from module-level state: SSR on Cloudflare Workers serves concurrent requests in different
 * locales from one module instance.
 */
export function getName<Category extends NameChunk>(
  category: Category,
  id: LocalizedCategoryId[Category],
  locale: LocaleCode,
): string {
  const name = readChunk(locale, category)[id];
  if (name !== undefined) return name;

  throw new Error(`No "${category}" name for id "${id}" in locale "${locale}"`);
}

/** The whole `category` chunk for `locale`. Use for bulk lookups (sorting, search). */
export function getNameTable<Category extends NameChunk>(
  category: Category,
  locale: LocaleCode,
): Readonly<Record<LocalizedCategoryId[Category], string>> {
  return readChunk(locale, category) as Readonly<Record<LocalizedCategoryId[Category], string>>;
}

/** Whether every chunk {@link loadNames} would fetch for these arguments is already resident. */
export function hasNames(locale: LocaleCode, categories: readonly NameChunk[]): boolean {
  return categories.every((category) => chunks.has(chunkKey(locale, category)));
}

/**
 * Loads `categories` for `locale`, caching each chunk for the session. Resolves once every
 * synchronous {@link getName} call for those categories in that locale can succeed. Repeat calls
 * for already-loaded chunks resolve immediately without a second fetch. Only `locale` is fetched:
 * search, which matches English terms too, loads `"en"` explicitly.
 */
export function loadNames(locale: LocaleCode, categories: readonly NameChunk[]): Promise<void> {
  return Promise.all(categories.map((category) => loadChunk(locale, category))).then(
    () => undefined,
  );
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

function chunkPath(locale: LocaleCode, category: NameChunk): string {
  return `./locales/${locale}/${category}.json`;
}

/** A failed import must not poison the cache: drop it so the next caller retries the fetch. */
async function dropFailedLoad(key: string, load: Promise<void>): Promise<void> {
  try {
    await load;
  } catch {
    chunkLoads.delete(key);
  }
}

function loadChunk(locale: LocaleCode, category: NameChunk): Promise<void> {
  const key = chunkKey(locale, category);
  const loader = chunkLoaders[chunkPath(locale, category)];
  if (!loader) {
    return Promise.reject(new Error(`The pipeline generated no name chunk "${key}"`));
  }

  let load = chunkLoads.get(key);
  if (!load) {
    load = (async () => {
      chunks.set(key, await loader());
    })();
    chunkLoads.set(key, load);
    void dropFailedLoad(key, load);
  }
  return load;
}

/**
 * The resident chunk for `locale`/`category`. The pipeline generates every category for every
 * locale, so a missing chunk file is a data bug. A chunk that exists but hasn't been loaded is a
 * programming error — the route's `load()` forgot to await it — and throws rather than silently
 * degrading.
 */
function readChunk(locale: LocaleCode, category: NameChunk): NameChunkContents {
  const key = chunkKey(locale, category);
  const chunk = chunks.get(key);
  if (chunk) return chunk;
  if (!(chunkPath(locale, category) in chunkLoaders)) {
    throw new Error(`The pipeline generated no name chunk "${key}"`);
  }
  throw new Error(
    `Name chunk "${key}" is not loaded; await loadNames("${locale}", ["${category}"]) before resolving names`,
  );
}
