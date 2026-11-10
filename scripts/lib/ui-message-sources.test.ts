import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { readUiMessageSources } from "./ui-message-sources.js";

describe("UI feature catalogs", () => {
  it("loads complete messages and rejects a missing locale or a misplaced key", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ui-feature-catalog-"));
    try {
      const featureDir = path.join(root, "features");
      mkdirSync(featureDir);
      const file = path.join(featureDir, "search.json");
      writeFileSync(file, JSON.stringify({ search_title: { en: "Search", es: "Buscar" } }));
      expect(readUiMessageSources(root, ["en", "es"])).toEqual({
        en: { search_title: "Search" },
        es: { search_title: "Buscar" },
      });
      expect(() => readUiMessageSources(root, ["en", "es", "fr"])).toThrow(/locale set/u);
      writeFileSync(file, JSON.stringify({ about_title: { en: "About", es: "Acerca de" } }));
      expect(() => readUiMessageSources(root, ["en", "es"])).toThrow(/about_title/u);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
