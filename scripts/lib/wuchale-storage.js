/// <reference lib="es2023.array" />
/// <reference types="node" />

import path from "node:path";
import { getKey } from "wuchale";

/** @typedef {Omit<import("wuchale").Item, "translations"> & { translations: Record<string, string | string[]> }} Row */

/** @param {string} left @param {string} right */
function compare(left, right) {
  return left < right ? -1 : Number(left !== right);
}

/** @param {string[]} shards @param {(item: import("wuchale").Item) => string} shardFor @returns {import("wuchale").StorageFactory} */
export function partitionedStorage(shards, shardFor) {
  return ({ fs, localesDir, root, sourceLocale }) => {
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
}
