import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getConfig, Hub } from "wuchale";

import { splitStorage } from "./split-storage.js";

/** @param {import("wuchale").Config} config @param {string} root */
export async function checkCatalogs(config, root) {
  // Wuchale's check uses an in-memory extraction pass. Supply no-op writes so CI never
  // changes the translator files, even when the source and catalogs disagree.
  /** @type {import("wuchale").FS} */
  const fs = {
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
  const sourceLocale = config.locales[0];
  const storage = await splitStorage({ ...config, fs, root, sourceLocale });
  const items = await storage.load();
  const errors = [];
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
  const hub = await Hub.create("cli", config, root, [], 0, fs);
  const result = await hub.check(true);
  for (const adapter of result.syncs) errors.push(`Extraction has pending changes: ${adapter}`);
  for (const { locale, source } of result.errors) {
    errors.push(`Invalid ${locale} translation structure: ${String(source)}`);
  }
  return errors;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const config = await getConfig(fileURLToPath(new URL("wuchale.config.js", import.meta.url)));
  const errors = await checkCatalogs(config, import.meta.dirname);
  if (errors.length > 0) {
    process.stderr.write(`${errors.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      "Extraction is current and every supported locale has a complete catalog.\n",
    );
  }
}
