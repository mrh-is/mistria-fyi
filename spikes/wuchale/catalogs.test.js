import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { getConfig, Hub } from "wuchale";

import { checkCatalogs } from "./check-catalogs.js";

const fixture = import.meta.dirname;

/** @typedef {{ translations: Record<string, string | string[]>, references: {file: string}[] }} CatalogRow */

/** @param {string} text */
function rows(text) {
  return /** @type {CatalogRow[]} */ (JSON.parse(text));
}

/** @param {CatalogRow[]} items */
function byEnglish(items) {
  return new Map(items.map(({ translations }) => [String(translations.en), translations]));
}

await test("real extraction round-trips split catalogs and exposes missing or stale translations", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wuchale-catalogs-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  await cp(path.join(fixture, "src/features"), path.join(root, "src/features"), {
    recursive: true,
  });
  const catalogDir = path.join(root, "catalogs");
  await cp(path.join(fixture, "catalogs"), catalogDir, {
    filter: (file) => file.endsWith(".json") || file === path.join(fixture, "catalogs"),
    recursive: true,
  });
  const config = await getConfig(path.join(fixture, "wuchale.config.js"));
  const extract = async (currentConfig = config) => {
    const hub = await Hub.create("cli", currentConfig, root);
    await hub.directVisit(true, false, false);
  };
  const read = (/** @type {string} */ name) =>
    readFile(path.join(catalogDir, `${name}.json`), "utf8");
  const readAll = () => Promise.all(["search", "settings", "shared"].map((name) => read(name)));
  const original = await readAll();
  const search = rows(original[0]);
  const settings = rows(original[1]);
  const [shared] = rows(original[2]);
  assert.equal(search.length, 6);
  assert.equal(settings.length, 1);
  assert.equal(shared.translations.en, "Try again");
  assert.equal(shared.references.length, 2);
  assert.deepEqual(await checkCatalogs(config, root), []);
  await extract();
  assert.deepEqual(await readAll(), original);

  const searchPath = path.join(root, "src/features/search/panel.svelte");
  const source = await readFile(searchPath, "utf8");
  await writeFile(searchPath, source.replace("No items found", "Nothing turned up"));
  assert.deepEqual(await checkCatalogs(config, root), ["Extraction has pending changes: ui"]);
  assert.equal(await read("search"), original[0]);

  await extract();
  const missing = await checkCatalogs(config, root);
  assert.match(missing.join("\n"), /Missing or incomplete es translation: Nothing turned up/u);
  const fallbackCatalog = await readFile(
    path.join(catalogDir, ".wuchale/ui.0.es.compiled.js"),
    "utf8",
  );
  assert.ok(fallbackCatalog.includes("Nothing turned up"));
  const edited = rows(await read("search"));
  assert.equal(
    edited.some(({ translations }) => translations.en === "No items found"),
    false,
  );
  assert.deepEqual(
    edited.find(({ translations }) => translations.en === "Search items")?.translations,
    search.find(({ translations }) => translations.en === "Search items")?.translations,
  );
  assert.equal(await read("settings"), original[1]);
  assert.equal(await read("shared"), original[2]);

  await writeFile(searchPath, source);
  await writeFile(path.join(catalogDir, "search.json"), original[0]);
  const movedPath = path.join(root, "src/features/settings/search-panel.svelte");
  await rename(searchPath, movedPath);
  await extract();
  assert.deepEqual(rows(await read("search")), []);
  assert.deepEqual(rows(await read("shared")), []);
  const moved = rows(await read("settings"));
  assert.equal(moved.length, 8);
  assert.deepEqual(byEnglish(moved), byEnglish([...search, ...settings, shared]));

  const expanded = { ...config, locales: [...config.locales, "de"] };
  const expandedErrors = await checkCatalogs(expanded, root);
  assert.equal(expandedErrors.filter((error) => error.includes("incomplete de")).length, 8);
  await extract(expanded);
  assert.deepEqual(byEnglish(rows(await read("settings"))), byEnglish(moved));
  assert.equal(await read("shared"), "[]\n");

  // The configured adapter sees Svelte source, not a string assembled in a plain module.
  const movedSource = await readFile(movedPath, "utf8");
  await writeFile(
    path.join(root, "src/features/settings/label.js"),
    'export const label = "Search" + " anywhere";',
  );
  await writeFile(
    movedPath,
    movedSource
      .replace("  let {", '  import { label } from "./label.js";\n  let {')
      .replace("</main>", "  <p>{label}</p>\n</main>"),
  );
  assert.deepEqual(await checkCatalogs(config, root), []);
  const afterBlindSpot = await read("settings");
  assert.equal(afterBlindSpot.includes("Search anywhere"), false);
});
