import path from "node:path";
import { getKey } from "wuchale";

import type { Item, StorageFactory } from "wuchale";

type Row = Omit<Item, "translations"> & { translations: Record<string, string | string[]> };

function compare(left: string, right: string): number {
  return left < right ? -1 : Number(left !== right);
}

export function partitionedStorage(
  shards: string[],
  shardFor: (item: Item) => string,
): StorageFactory {
  return ({ fs, localesDir, root, sourceLocale }) => {
    const directory = path.resolve(root, localesDir);
    const files = shards.map((shard) => path.join(directory, `${shard}.json`));
    const identity = (item: Item) => {
      const source = item.translations.get(sourceLocale);
      if (!source?.length) throw new Error(`Missing source message in ${directory}`);
      return getKey(source, item.context);
    };
    return {
      files,
      key: JSON.stringify(files.toSorted()),
      async load() {
        const items = new Map<string, Item>();
        const contents = await Promise.all(files.map(async (file) => fs.read(file)));
        for (const [index, file] of files.entries()) {
          const content = contents[index];
          const rows = content === null ? [] : (JSON.parse(content) as Row[]);
          for (const row of rows) {
            const item = { ...row, translations: new Map(Object.entries(row.translations)) };
            const id = identity(item);
            if (items.has(id)) throw new Error(`Duplicate catalog entry in ${file}: ${id}`);
            if (file !== path.join(directory, `${shardFor(item)}.json`)) {
              throw new Error(`Catalog entry is in the wrong shard: ${id}`);
            }
            items.set(id, item);
          }
        }
        return [...items.values()];
      },
      async save(items) {
        const partitions = new Map<string, Row[]>(shards.map((shard) => [shard, []]));
        for (const item of items.toSorted((a, b) => compare(identity(a), identity(b)))) {
          partitions.get(shardFor(item))?.push({
            ...item,
            references: item.references.toSorted((a, b) => compare(a.file, b.file)),
            translations: Object.fromEntries(item.translations),
          });
        }
        await fs.mkdir(directory);
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
