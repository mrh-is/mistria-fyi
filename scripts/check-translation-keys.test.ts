import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkTranslationKeys } from "./check-translation-keys.js";

describe("checkTranslationKeys", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "translation-keys-"));
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it("ignores non-locale JSON files such as game-terms.json", async () => {
    await writeFile(path.join(dir, "en.json"), JSON.stringify({ greeting: "Hello" }));
    await writeFile(path.join(dir, "fr.json"), JSON.stringify({ greeting: "Bonjour" }));
    await writeFile(path.join(dir, "game-terms.json"), JSON.stringify({ terms: {} }));

    expect(await checkTranslationKeys(dir)).toEqual([]);
  });

  it("reports no mismatches when key shapes match, regardless of content", async () => {
    await writeFile(
      path.join(dir, "en.json"),
      JSON.stringify({ $schema: "x", greeting: "Hello", nested: { label: "Go" } }),
    );
    await writeFile(
      path.join(dir, "fr.json"),
      JSON.stringify({ $schema: "x", greeting: "Bonjour", nested: { label: "Aller" } }),
    );

    expect(await checkTranslationKeys(dir)).toEqual([]);
  });

  it("reports missing and extra keys without caring about values", async () => {
    await writeFile(path.join(dir, "en.json"), JSON.stringify({ a: "A", b: "B" }));
    await writeFile(path.join(dir, "fr.json"), JSON.stringify({ a: "A", c: "C" }));

    expect(await checkTranslationKeys(dir)).toEqual([
      { extraKeys: ["c"], locale: "fr", missingKeys: ["b"] },
    ]);
  });

  it("flattens nested keys with dot paths", async () => {
    await writeFile(path.join(dir, "en.json"), JSON.stringify({ group: { a: "A", b: "B" } }));
    await writeFile(path.join(dir, "fr.json"), JSON.stringify({ group: { a: "A" } }));

    expect(await checkTranslationKeys(dir)).toEqual([
      { extraKeys: [], locale: "fr", missingKeys: ["group.b"] },
    ]);
  });

  it("ignores the $schema key", async () => {
    await writeFile(path.join(dir, "en.json"), JSON.stringify({ $schema: "x", a: "A" }));
    await writeFile(path.join(dir, "fr.json"), JSON.stringify({ $schema: "y", a: "A" }));

    expect(await checkTranslationKeys(dir)).toEqual([]);
  });
});
