import "#scripts/lib/require-pinned-node";

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { readAtRef, TRACKER_DATA_PATH } from "#scripts/data-diff";
import { findPendingUploads, listFiles, r2UploadOptionsFromEnv } from "#scripts/lib/r2-upload";
import { SPRITE_CACHE_CONTROL } from "#scripts/sprites/upload-sprites";

import type { TrackerData } from "#lib/types/tracker-data.js";
import type { PendingUpload, R2UploadTree } from "#scripts/lib/r2-upload";

/**
 * The game-update review report (#121), run as
 * `pnpm run game-update:report -- <baseline-ref> [--skip-sprites]`.
 *
 * It compares the tracker data at a baseline Git ref with the working copy & prints, as markdown
 * for the PR comment `docs/game-version-update-protocol.md` requires: the ID inventory by domain
 * (additions & removals), the contract-key changes (top-level keys & each domain's entity fields),
 * & the sprite deltas from the upload dry run. It exits 1 while that dry run lists pending
 * objects, so a report that exits 0 also proves production has every staged sprite. Renames are not
 * inferred: the protocol requires evidence, so the reviewer pairs removals with additions.
 */

type Entries = ReadonlyMap<string, unknown>;

interface Domain {
  entries: (data: Record<string, unknown>) => Entries;
  name: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The keys of a record-of-entities. Absent is empty (an older version may lack a domain). */
function record(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`Expected ${label} to be an object of entries.`);
  return value;
}

function entriesOf(value: unknown, label: string): Entries {
  return new Map(Object.entries(record(value, label)));
}

/** `parent/child` entries for each child record of `value`. */
function nested(value: unknown, label: string, childPath: (child: unknown) => unknown): Entries {
  const entries = new Map<string, unknown>();
  for (const [parentId, parent] of Object.entries(record(value, label))) {
    const children = childPath(parent);
    for (const [childId, child] of Object.entries(record(children, `${label}.${parentId}`))) {
      entries.set(`${parentId}/${childId}`, child);
    }
  }
  return entries;
}

function almanacItems(value: unknown, label: string): [string, Record<string, unknown>][] {
  const rows: [string, Record<string, unknown>][] = [];
  for (const [category, entry] of Object.entries(record(value, label))) {
    const items = record(entry, `${label}.${category}`).items;
    if (!Array.isArray(items)) throw new Error(`Expected ${label}.${category}.items to be a list.`);
    for (const item of items) {
      if (!isRecord(item) || !Array.isArray(item.itemIds) || item.itemIds.length === 0) {
        throw new Error(`Expected every ${label}.${category} entry to have item IDs.`);
      }
      rows.push([category, item]);
    }
  }
  return rows;
}

/**
 * The inventory domains, in the order the report lists them. An entry's ID is its key in the
 * tracker data, prefixed by its parent where it only has meaning inside one (`wing/set`).
 */
export const DOMAINS: readonly Domain[] = [
  { entries: (data) => entriesOf(data.almanac, "almanac"), name: "almanac categories" },
  {
    // An entry's ID is its canonical (first) member, so a regrouping shows as a removal & addition.
    entries: (data) =>
      new Map(
        almanacItems(data.almanac, "almanac").map(([category, entry]) => [
          `${category}/${String((entry.itemIds as unknown[])[0])}`,
          entry,
        ]),
      ),
    name: "almanac entries (canonical ID)",
  },
  {
    entries: (data) =>
      new Map(
        almanacItems(data.almanac, "almanac").flatMap(([category, entry]) =>
          (entry.itemIds as unknown[]).map((itemId): [string, unknown] => [
            `${category}/${String(itemId)}`,
            entry,
          ]),
        ),
      ),
    name: "almanac members",
  },
  { entries: (data) => entriesOf(data.animals, "animals"), name: "animals" },
  {
    entries: (data) =>
      nested(data.animals, "animals", (animal) => record(animal, "animal").cosmetics),
    name: "animal cosmetics",
  },
  {
    entries: (data) =>
      new Map(
        Object.entries(record(data.animals, "animals")).flatMap(([animalId, animal]) => {
          const tiers = record(animal, `animals.${animalId}`).variantTiers;
          if (!Array.isArray(tiers)) throw new Error(`Expected animals.${animalId}.variantTiers.`);
          return tiers.flatMap((tier) =>
            Object.entries(record(tier, `animals.${animalId}.variantTiers`)).map(
              ([variantId, variant]): [string, unknown] => [`${animalId}/${variantId}`, variant],
            ),
          );
        }),
      ),
    name: "animal variants",
  },
  { entries: (data) => entriesOf(data.cosmetics, "cosmetics"), name: "cosmetics" },
  { entries: (data) => entriesOf(data.cosmeticSlots, "cosmeticSlots"), name: "cosmetic slots" },
  { entries: (data) => entriesOf(data.dates, "dates"), name: "dates" },
  { entries: (data) => entriesOf(data.festivals, "festivals"), name: "festivals" },
  { entries: (data) => entriesOf(data.items, "items"), name: "items" },
  {
    entries: (data) =>
      new Map(
        (() => {
          const biomes = record(data.mines, "mines").biomes;
          if (biomes === undefined) return [];
          if (!Array.isArray(biomes)) throw new Error("Expected mines.biomes to be a list.");
          return biomes.map((biome): [string, unknown] => [
            String(record(biome, "mines.biomes").id),
            biome,
          ]);
        })(),
      ),
    name: "mines biomes",
  },
  {
    entries: (data) => entriesOf(record(data.mines, "mines").spells, "mines.spells"),
    name: "mines spells",
  },
  {
    entries: (data) => entriesOf(record(data.mount, "mount").appearances, "mount.appearances"),
    name: "mount appearances",
  },
  { entries: (data) => entriesOf(data.museum, "museum"), name: "museum wings" },
  {
    entries: (data) => nested(data.museum, "museum", (wing) => record(wing, "wing").sets),
    name: "museum sets",
  },
  {
    entries: (data) => entriesOf(record(data.pets, "pets").cosmetics, "pets.cosmetics"),
    name: "pet cosmetics",
  },
  {
    entries: (data) => entriesOf(record(data.pets, "pets").skins, "pets.skins"),
    name: "pet skins",
  },
  {
    entries: (data) => nested(data.quests, "quests", (quests) => quests),
    name: "quests (type/ID)",
  },
  { entries: (data) => entriesOf(data.recipes, "recipes"), name: "recipes" },
  { entries: (data) => entriesOf(data.skills, "skills"), name: "skills" },
  { entries: (data) => entriesOf(data.stores, "stores"), name: "stores" },
  {
    entries: (data) => entriesOf(data.treasureChestTiers, "treasureChestTiers"),
    name: "treasure chest tiers",
  },
  { entries: (data) => entriesOf(data.villagers, "villagers"), name: "villagers" },
];

/**
 * Where each top-level `TrackerData` key is accounted for: the inventory domains it feeds, or
 * "none" for values that are not collections of IDs. Typed against the contract, so adding a key
 * to `TrackerData` fails type checking until it is classified here.
 */
export const COVERAGE = {
  almanac: ["almanac categories", "almanac entries (canonical ID)", "almanac members"],
  animals: ["animals", "animal cosmetics", "animal variants"],
  categoryVisibility: "none",
  cosmetics: ["cosmetics"],
  cosmeticSlots: ["cosmetic slots"],
  dates: ["dates"],
  festivals: ["festivals"],
  items: ["items"],
  mines: ["mines biomes", "mines spells"],
  mount: ["mount appearances"],
  museum: ["museum wings", "museum sets"],
  perkTierLevels: "none",
  pets: ["pet cosmetics", "pet skins"],
  pregnancyQuestByVillager: "none",
  questOrder: "none",
  quests: ["quests (type/ID)"],
  recipes: ["recipes"],
  skills: ["skills"],
  stores: ["stores"],
  townRanks: "none",
  treasureChestTiers: ["treasure chest tiers"],
  version: "none",
  villagers: ["villagers"],
} as const satisfies Record<keyof TrackerData, "none" | readonly string[]>;

export interface DomainDiff {
  added: string[];
  baseCount: number;
  fieldsAdded: string[];
  fieldsRemoved: string[];
  headCount: number;
  name: string;
  removed: string[];
}

export interface DataComparison {
  baseVersion: string;
  domains: DomainDiff[];
  headVersion: string;
  topLevelAdded: string[];
  topLevelRemoved: string[];
}

/** Code-unit order, so the report never depends on the machine's locale. */
function sorted(values: Iterable<string>): string[] {
  return [...values].toSorted((a, b) => {
    if (a < b) return -1;
    return a > b ? 1 : 0;
  });
}

function difference(from: ReadonlySet<string>, other: ReadonlySet<string>): string[] {
  return sorted([...from].filter((value) => !other.has(value)));
}

/** The union of the field names of every entry that is an object. */
function fieldNames(entries: Entries): Set<string> {
  const names = new Set<string>();
  for (const value of entries.values()) {
    if (isRecord(value)) for (const key of Object.keys(value)) names.add(key);
  }
  return names;
}

function versionOf(data: Record<string, unknown>): string {
  return typeof data.version === "string" ? data.version : "unknown";
}

function asRecord(data: unknown, label: string): Record<string, unknown> {
  if (!isRecord(data)) throw new Error(`The ${label} tracker data is not an object.`);
  return data;
}

/** The domain-by-domain comparison of two tracker data documents. */
export function compareData(base: unknown, head: unknown): DataComparison {
  const baseData = asRecord(base, "baseline");
  const headData = asRecord(head, "candidate");
  const baseKeys = new Set(Object.keys(baseData));
  const headKeys = new Set(Object.keys(headData));
  const domains = DOMAINS.map((domain): DomainDiff => {
    const before = domain.entries(baseData);
    const after = domain.entries(headData);
    const beforeIds = new Set(before.keys());
    const afterIds = new Set(after.keys());
    const beforeFields = fieldNames(before);
    const afterFields = fieldNames(after);
    return {
      added: difference(afterIds, beforeIds),
      baseCount: before.size,
      fieldsAdded: difference(afterFields, beforeFields),
      fieldsRemoved: difference(beforeFields, afterFields),
      headCount: after.size,
      name: domain.name,
      removed: difference(beforeIds, afterIds),
    };
  });
  return {
    baseVersion: versionOf(baseData),
    domains,
    headVersion: versionOf(headData),
    topLevelAdded: difference(headKeys, baseKeys),
    topLevelRemoved: difference(baseKeys, headKeys),
  };
}

/** The sprite check: skipped on request, or the objects the upload dry run would still send. */
export type SpriteCheck =
  | { kind: "checked"; pending: PendingUpload[]; staged: number }
  | { kind: "skipped" };

const SPRITE_KINDS = ["items", "villagers"] as const;

function spriteKind(key: string): string {
  for (const kind of SPRITE_KINDS) {
    if (key.startsWith(`sprites/${kind}/`)) return kind;
  }
  return "other";
}

const code = (value: string): string => `\`${value}\``;
const list = (values: readonly string[]): string => values.map((value) => code(value)).join(", ");
const signed = (added: number, removed: number): string =>
  `${added > 0 ? "+" : ""}${String(added)} / ${removed > 0 ? "-" : ""}${String(removed)}`;

function detail(summary: string, values: readonly string[]): string {
  return `<details><summary>${summary}</summary>\n\n${list(values)}\n\n</details>`;
}

/** The report as GitHub-flavored markdown, ready to paste as the PR comment. */
export function renderReport(
  comparison: DataComparison,
  sprites: SpriteCheck,
  baseRef: string,
): string {
  const lines: string[] = [
    "## Game update review report",
    "",
    `Tracker data ${code(comparison.baseVersion)} (${code(baseRef)}) to ${code(comparison.headVersion)} (working copy). Renames are not inferred: pair a removal with an addition only with evidence (see the update protocol).`,
    "",
    "### ID inventory by domain",
    "",
    "| Domain | Baseline | Candidate | Added | Removed |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];
  for (const domain of comparison.domains) {
    lines.push(
      `| ${domain.name} | ${String(domain.baseCount)} | ${String(domain.headCount)} | ${String(domain.added.length)} | ${String(domain.removed.length)} |`,
    );
  }
  const changed = comparison.domains.filter((d) => d.added.length > 0 || d.removed.length > 0);
  if (changed.length === 0) {
    lines.push("", "No IDs were added or removed in any domain.");
  }
  for (const domain of changed) {
    lines.push("", `#### ${domain.name} (${signed(domain.added.length, domain.removed.length)})`);
    if (domain.added.length > 0) {
      lines.push("", detail(`Added (${String(domain.added.length)})`, domain.added));
    }
    if (domain.removed.length > 0) {
      lines.push("", detail(`Removed (${String(domain.removed.length)})`, domain.removed));
    }
  }

  lines.push("", "### Contract-key changes", "");
  const keyChanges: string[] = [];
  if (comparison.topLevelAdded.length > 0) {
    keyChanges.push(`- Top-level keys added: ${list(comparison.topLevelAdded)}`);
  }
  if (comparison.topLevelRemoved.length > 0) {
    keyChanges.push(`- Top-level keys removed: ${list(comparison.topLevelRemoved)}`);
  }
  for (const domain of comparison.domains) {
    if (domain.fieldsAdded.length > 0) {
      keyChanges.push(`- ${domain.name}, entry fields added: ${list(domain.fieldsAdded)}`);
    }
    if (domain.fieldsRemoved.length > 0) {
      keyChanges.push(`- ${domain.name}, entry fields removed: ${list(domain.fieldsRemoved)}`);
    }
  }
  lines.push(
    ...(keyChanges.length > 0 ? keyChanges : ["No top-level or entry-field keys changed."]),
    "",
    "### Sprite deltas",
    "",
  );
  if (sprites.kind === "skipped") {
    lines.push("The sprite dry run was skipped (`--skip-sprites`); production was not checked.");
  } else if (sprites.pending.length === 0) {
    lines.push(
      `The upload dry run lists nothing to send: production has all ${String(sprites.staged)} staged sprites.`,
    );
  } else {
    lines.push(
      `The upload dry run would still send ${String(sprites.pending.length)} of ${String(sprites.staged)} staged sprites. Upload them (\`pnpm run sprites:upload\`) before this report passes.`,
      "",
      "| Kind | New | Changed |",
      "| --- | ---: | ---: |",
    );
    for (const kind of [...SPRITE_KINDS, "other"]) {
      const ofKind = sprites.pending.filter((p) => spriteKind(p.key) === kind);
      if (ofKind.length === 0) continue;
      lines.push(
        `| ${kind} | ${String(ofKind.filter((p) => p.status === "missing").length)} | ${String(ofKind.filter((p) => p.status === "changed").length)} |`,
      );
    }
    lines.push(
      "",
      detail(
        "New (no object in production)",
        sprites.pending.filter((p) => p.status === "missing").map((p) => p.key),
      ),
      "",
      detail(
        "Changed (ETag differs; bump `spriteGeneration` in the same PR)",
        sprites.pending.filter((p) => p.status === "changed").map((p) => p.key),
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

export interface ReportOptions {
  baseRef: string;
  skipSprites: boolean;
  spritesDirectory: string;
}

/** Whether the report passes: no pending sprite objects (a skipped check never fails). */
export function reportPasses(sprites: SpriteCheck): boolean {
  return sprites.kind === "skipped" || sprites.pending.length === 0;
}

function spriteTree(directory: string): R2UploadTree {
  return {
    cacheControl: SPRITE_CACHE_CONTROL,
    contentType: "image/webp",
    dir: directory,
    extension: ".webp",
    keyPrefix: "sprites/",
    skipMode: "etag",
  };
}

async function checkSprites(directory: string): Promise<SpriteCheck> {
  if (!existsSync(directory)) {
    throw new Error(
      `No staged sprites in ${directory}; stage them with \`pnpm run pipeline -- <path> --sprites\` (gaming PC) or pass --skip-sprites.`,
    );
  }
  const tree = spriteTree(directory);
  const stagedFiles = await listFiles(directory);
  const staged = stagedFiles.filter((file) => file.endsWith(".webp")).length;
  const pending = await findPendingUploads(tree, r2UploadOptionsFromEnv());
  const unreachable = pending.filter((p) => p.status === "unreachable");
  if (unreachable.length > 0) {
    throw new Error(
      `Could not check ${String(unreachable.length)} sprite objects against production (for example ${unreachable[0]?.key ?? ""}); check the network & retry.`,
    );
  }
  return { kind: "checked", pending, staged };
}

/** Parses `<baseline-ref> [--skip-sprites] [--sprites=<dir>]`; `undefined` when invalid. */
export function parseArgs(argv: readonly string[], root: string): ReportOptions | undefined {
  let baseRef: string | undefined;
  let skipSprites = false;
  let spritesDirectory = path.join(root, "pipeline", "output", "sprites");
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--skip-sprites") {
      skipSprites = true;
    } else if (arg.startsWith("--sprites=")) {
      spritesDirectory = path.resolve(arg.slice("--sprites=".length));
    } else if (arg.startsWith("-") || baseRef !== undefined) {
      return undefined;
    } else {
      baseRef = arg;
    }
  }
  return baseRef === undefined ? undefined : { baseRef, skipSprites, spritesDirectory };
}

const USAGE = "Usage: pnpm run game-update:report -- <baseline-ref> [--skip-sprites]";

async function main(): Promise<number> {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const options = parseArgs(process.argv.slice(2), root);
  if (!options) {
    console.error(USAGE);
    return 2;
  }
  const base = readAtRef(root, options.baseRef);
  const head = JSON.parse(readFileSync(path.join(root, TRACKER_DATA_PATH), "utf8")) as unknown;
  const sprites: SpriteCheck = options.skipSprites
    ? { kind: "skipped" }
    : await checkSprites(options.spritesDirectory);
  process.stdout.write(renderReport(compareData(base, head), sprites, options.baseRef));
  if (!reportPasses(sprites)) {
    console.error("Sprites are pending upload; the report fails until the dry run lists nothing.");
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
