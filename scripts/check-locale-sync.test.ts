import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  checkLocaleSync,
  findAllowlistProblems,
  findStaleKeys,
  flattenMessages,
  parseAllowlist,
  parseBaseRef,
} from "./check-locale-sync.js";

import type { AllowlistEntry, LocaleVersions } from "./check-locale-sync.js";

/** Maps hold serialized values, as `flattenMessages` produces them. */
function map(values: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]));
}

function versions(base: Record<string, string>, head: Record<string, string>): LocaleVersions {
  return { base: map(base), head: map(head) };
}

function entry(overrides: Partial<AllowlistEntry> = {}): AllowlistEntry {
  return {
    english: "Mistria!",
    key: "brand",
    locale: "ja",
    reason: "A proper noun, the same in every script.",
    ...overrides,
  };
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

    expect(findStaleKeys(english, locales, [entry()])).toEqual([{ key: "brand", locale: "es" }]);
  });

  it("stops honoring an allowlist entry once the English text moves past the reviewed one", () => {
    const english = versions({ brand: "Mistria" }, { brand: "Mistria, again" });
    const locales = { ja: versions({ brand: "Mistria" }, { brand: "Mistria" }) };

    expect(findStaleKeys(english, locales, [entry()])).toEqual([{ key: "brand", locale: "ja" }]);
  });

  it("flags a locale whose value was changed & then reverted to the base text", () => {
    const english = versions({ greeting: "Hello" }, { greeting: "Hi there" });
    // The working tree's value equals the merge base's, whatever happened in between.
    const reverted = versions({ greeting: "Bonjour" }, { greeting: "Bonjour" });

    expect(findStaleKeys(english, { fr: reverted })).toEqual([{ key: "greeting", locale: "fr" }]);
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

describe("findAllowlistProblems", () => {
  const english = versions({ brand: "Mistria" }, { brand: "Mistria!" });
  const locales = { ja: versions({ brand: "Mistria" }, { brand: "Mistria" }) };

  it("accepts an entry for an existing key & locale", () => {
    expect(findAllowlistProblems(english, locales, [entry()])).toEqual([]);
  });

  it("reports an entry for a missing key or a locale with no file", () => {
    const problems = findAllowlistProblems(english, locales, [
      entry({ key: "gone" }),
      entry({ locale: "xx" }),
    ]);

    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/ja: gone .*not in en\.json/);
    expect(problems[1]).toMatch(/xx: brand .*no messages file/);
  });
});

describe("parseAllowlist", () => {
  it("accepts complete entries", () => {
    expect(parseAllowlist([entry()])).toEqual([entry()]);
  });

  it("rejects a non-array, or an entry missing a field", () => {
    expect(() => parseAllowlist({})).toThrow(/array/);
    expect(() => parseAllowlist([{ ...entry(), reason: " " }])).toThrow(/"reason"/);
    expect(() => parseAllowlist([{ ...entry(), english: undefined }])).toThrow(/"english"/);
    expect(() => parseAllowlist([{ ...entry(), key: "" }])).toThrow(/"key"/);
    expect(() => parseAllowlist([null])).toThrow(/"english"/);
  });
});

describe("parseBaseRef", () => {
  it("defaults to origin/main & accepts both flag forms", () => {
    expect(parseBaseRef([])).toBe("origin/main");
    expect(parseBaseRef(["--base", "HEAD^1"])).toBe("HEAD^1");
    expect(parseBaseRef(["--base=HEAD^1"])).toBe("HEAD^1");
    expect(parseBaseRef(["--", "--base", "main"])).toBe("main");
  });

  it("throws when --base has no value, or an argument is unknown", () => {
    expect(() => parseBaseRef(["--base"])).toThrow(/needs a ref/);
    expect(() => parseBaseRef(["--base="])).toThrow(/needs a ref/);
    expect(() => parseBaseRef(["--base", "--other"])).toThrow(/needs a ref/);
    expect(() => parseBaseRef(["--nope"])).toThrow(/Unknown argument/);
  });
});

describe("checkLocaleSync", () => {
  let repository: string;

  function git(...args: string[]): void {
    execFileSync(
      "git",
      [
        "-c",
        "commit.gpgsign=false",
        "-c",
        "tag.gpgsign=false",
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@t",
        ...args,
      ],
      { cwd: repository, stdio: "ignore" },
    );
  }

  function write(locale: string, messages: Record<string, string>): void {
    writeFileSync(path.join(repository, "messages", `${locale}.json`), JSON.stringify(messages));
  }

  function commit(message: string): void {
    git("add", "-A");
    git("commit", "-q", "-m", message);
  }

  function runScript(...args: string[]) {
    return spawnSync("node", [path.join(import.meta.dirname, "check-locale-sync.ts"), ...args], {
      cwd: repository,
      encoding: "utf8",
    });
  }

  beforeEach(() => {
    repository = mkdtempSync(path.join(tmpdir(), "locale-sync-"));
    mkdirSync(path.join(repository, "messages"));
    mkdirSync(path.join(repository, "scripts"));
    git("init", "-q", "-b", "main");
    write("en", { changed: "One", kept: "Same", translated: "First" });
    write("fr", { changed: "Un", kept: "Pareil", translated: "Premier" });
    writeFileSync(path.join(repository, "scripts", "locale-sync-allowlist.json"), "[]");
    commit("base");
    git("tag", "base");
  });

  afterEach(() => {
    rmSync(repository, { force: true, recursive: true });
  });

  it("compares the merge base with the committed & working-tree changes", () => {
    write("en", { changed: "Uno", kept: "Same", translated: "Second" });
    write("fr", { changed: "Un", kept: "Pareil", translated: "Deuxième" });
    commit("change");

    expect(checkLocaleSync("base", [], repository).stale).toEqual([
      { key: "changed", locale: "fr" },
    ]);
    expect(
      checkLocaleSync(
        "base",
        [entry({ english: "Uno", key: "changed", locale: "fr" })],
        repository,
      ),
    ).toEqual({ allowlistProblems: [], stale: [] });
  });

  it("is clean when nothing changed since the merge base", () => {
    expect(checkLocaleSync("base", [], repository)).toEqual({ allowlistProblems: [], stale: [] });
  });

  it("flags a locale that was changed in one commit & reverted in the working tree", () => {
    write("en", { changed: "Uno", kept: "Same", translated: "First" });
    write("fr", { changed: "Une", kept: "Pareil", translated: "Premier" });
    commit("change both");
    write("fr", { changed: "Un", kept: "Pareil", translated: "Premier" });

    expect(checkLocaleSync("base", [], repository).stale).toEqual([
      { key: "changed", locale: "fr" },
    ]);
  });

  it("treats a locale file that is new since the base as changed", () => {
    write("en", { changed: "Uno", kept: "Same", translated: "First" });
    write("fr", { changed: "Une", kept: "Pareil", translated: "Premier" });
    write("es", { changed: "Uno", kept: "Igual", translated: "Primero" });
    commit("change & add es");

    expect(checkLocaleSync("base", [], repository).stale).toEqual([]);
  });

  it("raises a friendly error when the base ref cannot be resolved", () => {
    expect(() => checkLocaleSync("no-such-ref", [], repository)).toThrow(
      /Cannot find a merge base/,
    );
  });

  describe("command line", () => {
    it("exits 0 & says so when nothing is stale", () => {
      const result = runScript("--base", "base");

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("No locale value is stale");
    });

    it("exits 1 & lists each stale locale & key on stderr", () => {
      write("en", { changed: "Uno", kept: "Same", translated: "First" });
      commit("change english only");

      const result = runScript("--base=base");

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("fr: changed");
    });

    it("reads the allowlist file from the repository", () => {
      write("en", { changed: "Uno", kept: "Same", translated: "First" });
      commit("change english only");
      writeFileSync(
        path.join(repository, "scripts", "locale-sync-allowlist.json"),
        JSON.stringify([entry({ english: "Uno", key: "changed", locale: "fr" })]),
      );

      const result = runScript("--base", "base");

      expect(result.status, result.stderr).toBe(0);
    });

    it("fails on an allowlist entry for a key that does not exist", () => {
      writeFileSync(
        path.join(repository, "scripts", "locale-sync-allowlist.json"),
        JSON.stringify([entry({ key: "gone", locale: "fr" })]),
      );

      const result = runScript("--base", "base");

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/fr: gone .*not in en\.json/);
    });

    it("exits 1 with a plain message when --base has no value or the ref is unknown", () => {
      const missingValue = runScript("--base");
      const unknownRef = runScript("--base", "no-such-ref");

      expect(missingValue.status).toBe(1);
      expect(missingValue.stderr).toContain("--base needs a ref");
      expect(unknownRef.status).toBe(1);
      expect(unknownRef.stderr).toContain("Cannot find a merge base");
    });
  });
});
