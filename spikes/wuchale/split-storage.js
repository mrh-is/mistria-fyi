/// <reference lib="es2023.array" />

import path from "node:path";
import { getKey, normalizeSep } from "wuchale";

// Fixed names let Wuchale register every catalog with its watcher before extraction.
const shards = ["search", "settings", "shared"];

/** @typedef {Omit<import("wuchale").Item, "translations"> & { translations: Record<string, string | string[]> }} Row */

/** @param {import("wuchale").Item} item */
function shardFor(item) {
  const features = new Set(
    item.references.map(({ file }) => {
      const feature = path.posix.dirname(normalizeSep(file)).split("/")[2];
      if (feature !== "search" && feature !== "settings") {
        throw new Error(`Unknown catalog owner: ${file}`);
      }
      return feature;
    }),
  );
  return features.size === 1 ? [...features][0] : "shared";
}

/** @param {string} left @param {string} right */
function compare(left, right) {
  return left < right ? -1 : Number(left !== right);
}

/** @type {import("wuchale").StorageFactory} */
export const splitStorage = ({ fs, localesDir, root, sourceLocale }) => {
  const key = path.resolve(root, localesDir);
  const files = shards.map((shard) => path.join(key, `${shard}.json`));
  /** @param {import("wuchale").Item} item */
  const identity = (item) => {
    const source = item.translations.get(sourceLocale);
    if (!source?.length) throw new Error(`Missing source message in ${key}`);
    return getKey(source, item.context);
  };
  return {
    files,
    key,
    async load() {
      /** @type {Map<string, import("wuchale").Item>} */
      const items = new Map();
      const contents = await Promise.all(files.map(async (file) => fs.read(file)));
      for (const [index, file] of files.entries()) {
        const content = contents[index];
        const rows = /** @type {Row[]} */ (content === null ? [] : JSON.parse(content));
        for (const row of rows) {
          const item = { ...row, translations: new Map(Object.entries(row.translations)) };
          const id = identity(item);
          if (items.has(id)) throw new Error(`Duplicate catalog entry in ${file}: ${id}`);
          if (file !== path.join(key, `${shardFor(item)}.json`)) {
            throw new Error(`Catalog entry is in the wrong shard: ${id}`);
          }
          items.set(id, item);
        }
      }
      return [...items.values()];
    },
    /** @param {import("wuchale").Item[]} items */
    async save(items) {
      const partitions = new Map(shards.map((shard) => [shard, /** @type {Row[]} */ ([])]));
      for (const item of items.toSorted((a, b) => compare(identity(a), identity(b)))) {
        partitions.get(shardFor(item))?.push({
          ...item,
          references: item.references.toSorted((a, b) => compare(a.file, b.file)),
          translations: Object.fromEntries(item.translations),
        });
      }
      await fs.mkdir(key);
      await Promise.all(
        shards.map(async (shard, index) => {
          const file = files[index];
          const content = `${JSON.stringify(partitions.get(shard), null, 2)}\n`;
          if ((await fs.read(file)) !== content) await fs.write(file, content);
        }),
      );
    },
  };
};
