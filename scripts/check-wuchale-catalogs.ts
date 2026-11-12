import "#scripts/lib/require-pinned-node";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getConfig, Hub } from "wuchale";

import type { Config, FS } from "wuchale";

export async function checkCatalogs(config: Config, root: string): Promise<string[]> {
  // Wuchale's check uses an in-memory extraction pass. Supply no-op writes so CI never
  // changes the translator files, even when the source and catalogs disagree.
  const fs: FS = {
    exists: async (file) => (await fs.read(file)) !== null,
    mkdir: () => undefined,
    async read(file) {
      try {
        return await readFile(file, "utf8");
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        return null;
      }
    },
    unlink: () => false,
    write: () => undefined,
  };
  const errors = [];
  const storages = await Promise.all(
    Object.values(config.adapters).map(async (adapter) => {
      const sourceLocale = adapter.sourceLocale ?? config.locales[0];
      const storage = await adapter.storage({ ...config, fs, root, sourceLocale });
      return { items: await storage.load(), sourceLocale };
    }),
  );
  for (const { items, sourceLocale } of storages) {
    if (items.length === 0) errors.push("Catalog is empty");
    for (const { references, translations } of items) {
      const source = translations.get(sourceLocale);
      if (references.length === 0) errors.push(`Obsolete message: ${String(source)}`);
      for (const locale of config.locales) {
        const value = translations.get(locale);
        const forms = Array.isArray(value) ? value : [value];
        if (
          Array.isArray(value) !== Array.isArray(source) ||
          forms.length === 0 ||
          forms.some((form) => typeof form !== "string" || !form.trim())
        ) {
          errors.push(`Missing or incomplete ${locale} translation: ${String(source)}`);
        }
      }
    }
  }
  const hub = await Hub.create("cli", { ...config, ai: null }, root, [], 0, fs);
  const result = await hub.check(true);
  for (const adapter of result.syncs) errors.push(`Extraction has pending changes: ${adapter}`);
  for (const { locale, source } of result.errors) {
    errors.push(`Invalid ${locale} translation structure: ${String(source)}`);
  }
  return errors;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const configPath = path.resolve(process.argv[2] ?? "wuchale.config.ts");
  const config = await getConfig(configPath);
  const errors = await checkCatalogs(config, path.dirname(configPath));
  if (errors.length > 0) {
    process.stderr.write(`${errors.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      "Extraction is current and every supported locale has a complete catalog.\n",
    );
  }
}
