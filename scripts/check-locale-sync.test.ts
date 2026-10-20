import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  checkLocaleSync,
  findStaleKeys,
  flattenMessages,
  parseAllowlist,
} from "./check-locale-sync.js";

import type { LocaleVersions } from "./check-locale-sync.js";

function versions(base: Record<string, string>, head: Record<string, string>): LocaleVersions {
  return { base: new Map(Object.entries(base)), head: new Map(Object.entries(head)) };
}

describe("flattenMessages", () => {
  it("flattens nested objects, serializes variants, & drops $schema", () => {
    expect(
      flattenMessages({ $schema: "x", a: "A", nested: { b: "B" }, variants: [{ match: "x" }] }),
    ).toEqual(
      new Map([
        ["a", JSON.stringify("A")],
        ["nested.b", JSON.stringify("B")],
        ["variants", JSON.stringify([{ match: "x" }])],
      ]),
    );
  });
});

describe("findStaleKeys", () => {
  it("flags a locale whose value did not change with a changed English value", () => {
    const english = versions({ greeting: "Hello" }, { greeting: "Hi there" });

    expect(
      findStaleKeys(english, { fr: versions({ greeting: "Bonjour" }, { greeting: "Bonjour" }) }),
    ).toEqual([{ key: "greeting", locale: "fr" }]);
  });

  it("passes a locale that changed the same key", () => {
    const english = versions({ greeting: "Hello" }, { greeting: "Hi there" });

    expect(
      findStaleKeys(english, { fr: versions({ greeting: "Bonjour" }, { greeting: "Salut" }) }),
    ).toEqual([]);
  });

  it("ignores keys whose English value is unchanged", () => {
    const english = versions({ greeting: "Hello" }, { greeting: "Hello" });

    expect(
      findStaleKeys(english, { fr: versions({ greeting: "Bonjour" }, { greeting: "Bonjour" }) }),
    ).toEqual([]);
  });

  it("ignores added English keys, since the key-shape check owns them", () => {
    const english = versions({}, { fresh: "New" });

    expect(findStaleKeys(english, { fr: versions({}, { fresh: "Nouveau" }) })).toEqual([]);
    expect(findStaleKeys(english, { fr: versions({}, {}) })).toEqual([]);
  });

  it("ignores removed English keys", () => {
    const english = versions({ gone: "Bye" }, {});

    expect(findStaleKeys(english, { fr: versions({ gone: "Au revoir" }, {}) })).toEqual([]);
  });

  it("passes a locale that added the key in the same change", () => {
    const english = versions({ greeting: "Hello" }, { greeting: "Hi there" });

    expect(findStaleKeys(english, { fr: versions({}, { greeting: "Bonjour" }) })).toEqual([]);
  });

  it("skips a locale that lacks the key, which the key-shape check reports", () => {
    const english = versions({ greeting: "Hello" }, { greeting: "Hi there" });

    expect(findStaleKeys(english, { fr: versions({ greeting: "Bonjour" }, {}) })).toEqual([]);
  });

  it("honors the allowlist per key & locale, & reports the other locales", () => {
    const english = versions({ brand: "Mistria" }, { brand: "Mistria!" });
    const locales = {
      es: versions({ brand: "Mistria" }, { brand: "Mistria" }),
      ja: versions({ brand: "Mistria" }, { brand: "Mistria" }),
    };

    expect(
      findStaleKeys(english, locales, [
        { key: "brand", locale: "ja", reason: "A proper noun, the same in every script." },
      ]),
    ).toEqual([{ key: "brand", locale: "es" }]);
  });

  it("sorts by locale, then key", () => {
    const english = versions({ a: "1", b: "1" }, { a: "2", b: "2" });
    const same = versions({ a: "x", b: "x" }, { a: "x", b: "x" });

    expect(findStaleKeys(english, { es: same, ru: same })).toEqual([
      { key: "a", locale: "es" },
      { key: "b", locale: "es" },
      { key: "a", locale: "ru" },
      { key: "b", locale: "ru" },
    ]);
  });
});

describe("parseAllowlist", () => {
  it("accepts complete entries", () => {
    expect(parseAllowlist([{ key: "a", locale: "fr", reason: "Same word." }])).toEqual([
      { key: "a", locale: "fr", reason: "Same word." },
    ]);
  });

  it("rejects a non-array, or an entry missing a field or a reason", () => {
    expect(() => parseAllowlist({})).toThrow(/array/);
    expect(() => parseAllowlist([{ key: "a", locale: "fr" }])).toThrow(/"reason"/);
    expect(() => parseAllowlist([{ key: "a", locale: "fr", reason: " " }])).toThrow(/"reason"/);
    expect(() => parseAllowlist([null])).toThrow(/"key"/);
  });
});

describe("checkLocaleSync", () => {
  let repository: string;

  function git(...args: string[]): void {
    execFileSync(
      "git",
      ["-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t", ...args],
      {
        cwd: repository,
        stdio: "ignore",
      },
    );
  }

  function write(locale: string, messages: Record<string, string>): void {
    writeFileSync(path.join(repository, "messages", `${locale}.json`), JSON.stringify(messages));
  }

  beforeEach(() => {
    repository = mkdtempSync(path.join(tmpdir(), "locale-sync-"));
    mkdirSync(path.join(repository, "messages"));
    git("init", "-q", "-b", "main");
    write("en", { changed: "One", kept: "Same", translated: "First" });
    write("fr", { changed: "Un", kept: "Pareil", translated: "Premier" });
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("tag", "base");
  });

  afterEach(() => {
    rmSync(repository, { force: true, recursive: true });
  });

  it("compares the merge base with the committed & working-tree changes", () => {
    write("en", { changed: "Uno", kept: "Same", translated: "Second" });
    write("fr", { changed: "Un", kept: "Pareil", translated: "Deuxième" });
    git("add", "-A");
    git("commit", "-q", "-m", "change");

    expect(checkLocaleSync("base", [], repository)).toEqual([{ key: "changed", locale: "fr" }]);
    expect(
      checkLocaleSync("base", [{ key: "changed", locale: "fr", reason: "Cognate." }], repository),
    ).toEqual([]);
  });

  it("is clean when nothing changed since the merge base", () => {
    expect(checkLocaleSync("base", [], repository)).toEqual([]);
  });
});
