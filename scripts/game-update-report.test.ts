import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  compareData,
  COVERAGE,
  DOMAINS,
  parseArgs,
  renderReport,
  reportPasses,
} from "./game-update-report.js";

import type { SpriteCheck } from "./game-update-report.js";

const script = fileURLToPath(new URL("game-update-report.ts", import.meta.url));

/** A tracker data fixture with a little of every shape the domains read. */
function data(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    almanac: {
      fish: {
        items: [{ itemIds: ["bass", "bass_gold"] }, { itemIds: ["carp"], recipeId: "carp_stew" }],
      },
    },
    animals: {
      chicken: {
        cosmetics: { hat: { sources: [] } },
        variantTiers: [{ white: { source: { type: "default" } } }],
      },
    },
    categoryVisibility: {},
    cosmetics: { hat: { slot: "hats", sources: [] } },
    cosmeticSlots: { hats: { subCategories: [] } },
    dates: {},
    festivals: { spring: {} },
    items: { bass: { name: "x" }, carp: { name: "y" } },
    mines: { biomes: [{ floors: [1, 5], id: "cave" }], spells: { fireball: {} } },
    mount: { appearances: { mistmare: { sources: [] } } },
    museum: { art: { sets: { paintings: { items: ["bass"] } } } },
    perkTierLevels: [1, 2, 3, 4, 5],
    pets: { cosmetics: {}, skins: { tabby: {} } },
    pregnancyQuestByVillager: {},
    questOrder: {},
    quests: { main: { first: { name: "a" } } },
    recipes: { carp_stew: {} },
    skills: { farming: { perkTiers: [{ green_thumb: {} }, {}, {}, {}, {}] } },
    stores: { general: {} },
    townRanks: [],
    treasureChestTiers: {},
    version: "1.0.0",
    villagers: { adeline: { birthday: 1 } },
    ...overrides,
  };
}

function row(comparison: ReturnType<typeof compareData>, name: string) {
  const found = comparison.domains.find((domain) => domain.name === name);
  if (!found) throw new Error(`No domain ${name}`);
  return found;
}

describe("domains", () => {
  it("covers every top-level key of the tracker data contract by naming real domains", () => {
    const names = new Set(DOMAINS.map(({ name }) => name));
    for (const covered of Object.values(COVERAGE)) {
      if (covered === "none") continue;
      for (const name of covered) expect(names, name).toContain(name);
    }
    const claimed = Object.values(COVERAGE).flatMap((value) => (value === "none" ? [] : value));
    expect(new Set(claimed)).toEqual(names);
  });
});

describe("compareData", () => {
  it("reports no change for identical data", () => {
    const comparison = compareData(data(), data());

    expect(comparison.baseVersion).toBe("1.0.0");
    for (const domain of comparison.domains) {
      expect([domain.name, domain.added, domain.removed]).toEqual([domain.name, [], []]);
      expect(domain.baseCount).toBe(domain.headCount);
    }
    expect(comparison.topLevelAdded).toEqual([]);
    expect(comparison.topLevelRemoved).toEqual([]);
  });

  it("lists added & removed IDs per domain, in sorted order", () => {
    const base = data();
    const head = data({
      items: { carp: { name: "y" }, trout: { name: "z" }, zander: { name: "w" } },
      version: "1.1.0",
    });

    const items = row(compareData(base, head), "items");

    expect(items).toMatchObject({
      added: ["trout", "zander"],
      baseCount: 2,
      headCount: 3,
      removed: ["bass"],
    });
    expect(compareData(base, head).headVersion).toBe("1.1.0");
  });

  it("keys nested domains by their parent & the almanac by canonical ID & member", () => {
    const head = data({
      almanac: {
        fish: {
          items: [
            // `bass_gold` regrouped under a new canonical ID: the entry is removed & added, the
            // member list shows only the new member.
            { itemIds: ["aaa_first", "bass_gold"] },
            { itemIds: ["bass"] },
            { itemIds: ["carp"], recipeId: "carp_stew" },
          ],
        },
      },
      museum: { art: { sets: { paintings: { items: [] }, statues: { items: [] } } } },
    });

    const comparison = compareData(data(), head);

    expect(row(comparison, "almanac entries (canonical ID)")).toMatchObject({
      added: ["fish/aaa_first"],
      removed: [],
    });
    expect(row(comparison, "almanac entries (canonical ID)").headCount).toBe(3);
    expect(row(comparison, "almanac members")).toMatchObject({
      added: ["fish/aaa_first"],
      removed: [],
    });
    expect(row(comparison, "museum sets")).toMatchObject({ added: ["art/statues"] });
    expect(row(comparison, "animal cosmetics").headCount).toBe(1);
    expect(row(comparison, "animal variants").headCount).toBe(1);
    expect(row(comparison, "quests (type/ID)").headCount).toBe(1);
    expect(row(comparison, "mines biomes").headCount).toBe(1);
    expect(row(comparison, "museum set members")).toMatchObject({
      baseCount: 1,
      headCount: 0,
      removed: ["art/paintings/bass"],
    });
  });

  it("inventories perks by skill & keys inside the domain containers", () => {
    const head = data({
      mines: { biomes: [], extra: {}, spells: {} },
      skills: { farming: { perkTiers: [{ green_thumb: {} }, { deep_roots: {} }, {}, {}, {}] } },
    });

    const comparison = compareData(data(), head);

    expect(row(comparison, "perks")).toMatchObject({ added: ["farming/deep_roots"], headCount: 2 });
    expect(comparison.containers.find(({ name }) => name === "mines")).toEqual({
      added: ["extra"],
      name: "mines",
      removed: [],
    });
    expect(renderReport(comparison, { kind: "skipped" }, "HEAD")).toContain(
      "- `mines` keys added: `extra`",
    );
  });

  it("reports top-level keys & entry fields that appeared or disappeared", () => {
    const withoutMount = data();
    delete withoutMount.mount;
    const comparison = compareData(
      withoutMount,
      data({ villagers: { adeline: { birthday: 1, dateable: true } } }),
    );

    expect(comparison.topLevelAdded).toEqual(["mount"]);
    expect(row(comparison, "villagers").fieldsAdded).toEqual(["dateable"]);
    expect(row(comparison, "mount appearances")).toMatchObject({
      added: ["mistmare"],
      baseCount: 0,
    });

    const reverse = compareData(data(), withoutMount);
    expect(reverse.topLevelRemoved).toEqual(["mount"]);
    expect(row(reverse, "villagers").fieldsRemoved).toEqual([]);
  });

  it("throws on a domain of the wrong shape instead of guessing", () => {
    expect(() => compareData(data(), data({ items: [] }))).toThrow(/items/);
    expect(() => compareData(data(), data({ almanac: { fish: { items: "x" } } }))).toThrow(
      /almanac.fish.items/,
    );
    expect(() => compareData([], data())).toThrow(/baseline/);
  });

  it("throws on a missing ID or a repeated one instead of coercing or overwriting", () => {
    expect(() =>
      compareData(data(), data({ mines: { biomes: [{ floors: [1, 5] }], spells: {} } })),
    ).toThrow(/mines.biomes\[\].id/);
    expect(() =>
      compareData(data(), data({ almanac: { fish: { items: [{ itemIds: [7] }] } } })),
    ).toThrow(/almanac.fish item IDs/);
    expect(() =>
      compareData(
        data(),
        data({ almanac: { fish: { items: [{ itemIds: ["bass"] }, { itemIds: ["bass"] }] } } }),
      ),
    ).toThrow(/bass repeats/);
  });
});

describe("renderReport", () => {
  const skipped: SpriteCheck = { kind: "skipped" };

  it("renders the inventory table, ID lists, key changes, & a skipped sprite check", () => {
    const comparison = compareData(
      data(),
      data({ items: { carp: {}, trout: {} }, villagers: { adeline: { birthday: 1, extra: 1 } } }),
    );

    const markdown = renderReport(comparison, skipped, "origin/main");

    expect(markdown).toContain("| items | 2 | 2 | 1 | 1 |");
    expect(markdown).toContain("#### items (+1 / -1)");
    expect(markdown).toContain("<summary>Added (1)</summary>");
    expect(markdown).toContain("`trout`");
    expect(markdown).toContain("`bass`");
    expect(markdown).toContain("- villagers, entry fields added: `extra`");
    expect(markdown).toContain("The sprite dry run was skipped");
  });

  it("says so when nothing changed", () => {
    const markdown = renderReport(compareData(data(), data()), skipped, "HEAD");

    expect(markdown).toContain("No IDs were added or removed in any domain.");
    expect(markdown).toContain("No top-level or entry-field keys changed.");
  });

  it("lists pending sprites by kind & status, & a clean check as nothing to send", () => {
    const comparison = compareData(data(), data());
    const pending: SpriteCheck = {
      kind: "checked",
      pending: [
        { key: "sprites/items/new.webp", status: "missing" },
        { key: "sprites/items/old.webp", status: "changed" },
        { key: "sprites/villagers/adeline.webp", status: "missing" },
      ],
      staged: 10,
      unstaged: [],
    };

    const markdown = renderReport(comparison, pending, "HEAD");

    expect(markdown).toContain("would still send 3 of 10 staged sprites");
    expect(markdown).toContain("| items | 1 | 1 |");
    expect(markdown).toContain("| villagers | 1 | 0 |");
    expect(markdown).toContain("`sprites/items/old.webp`");
    expect(
      renderReport(comparison, { kind: "checked", pending: [], staged: 10, unstaged: [] }, "HEAD"),
    ).toContain("production has all 10 staged sprites");
  });

  it("warns about added items & villagers with no staged sprite", () => {
    const markdown = renderReport(
      compareData(data(), data()),
      { kind: "checked", pending: [], staged: 1, unstaged: ["items/trout.webp"] },
      "HEAD",
    );

    expect(markdown).toContain("Warning: 1 added sprite IDs have no staged sprite");
    expect(markdown).toContain("`items/trout.webp`");
  });
});

describe("reportPasses", () => {
  it("fails only while the sprite dry run lists pending objects", () => {
    expect(reportPasses({ kind: "skipped" })).toBe(true);
    expect(reportPasses({ kind: "checked", pending: [], staged: 3, unstaged: [] })).toBe(true);
    expect(
      reportPasses({
        kind: "checked",
        pending: [{ key: "sprites/items/a.webp", status: "missing" }],
        staged: 3,
        unstaged: [],
      }),
    ).toBe(false);
  });
});

describe("parseArgs", () => {
  it("takes one baseline ref, with optional sprite flags", () => {
    expect(parseArgs(["--", "origin/main"], "/repo")).toMatchObject({
      baseRef: "origin/main",
      skipSprites: false,
    });
    expect(parseArgs(["HEAD", "--skip-sprites"], "/repo")?.skipSprites).toBe(true);
    expect(parseArgs(["HEAD", "--sprites=out/sprites"], "/repo")?.spritesDirectory).toBe(
      path.resolve("out/sprites"),
    );
    expect(parseArgs(["HEAD", "--out=report.md"], "/repo")?.out).toBe(path.resolve("report.md"));
    expect(parseArgs(["HEAD"], "/repo")?.out).toBeUndefined();
  });

  it("rejects a missing ref, a second ref, & an unknown flag", () => {
    expect(parseArgs([], "/repo")).toBeUndefined();
    expect(parseArgs(["a", "b"], "/repo")).toBeUndefined();
    expect(parseArgs(["a", "--nope"], "/repo")).toBeUndefined();
  });
});

describe("command line", () => {
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

  function writeData(contents: Record<string, unknown>): void {
    writeFileSync(
      path.join(repository, "src", "lib", "data", "tracker-data.json"),
      JSON.stringify(contents),
    );
  }

  beforeEach(() => {
    repository = mkdtempSync(path.join(tmpdir(), "game-update-report-"));
    mkdirSync(path.join(repository, "src", "lib", "data"), { recursive: true });
    git("init", "-q", "-b", "main");
    writeData(data());
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("tag", "base");
    writeData(data({ items: { carp: {}, trout: {} }, version: "1.1.0" }));
  });

  afterEach(() => {
    rmSync(repository, { force: true, recursive: true });
  });

  async function run(args: string[], env: Record<string, string> = {}) {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: repository,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const [status] = (await once(child, "close")) as [null | number];
    return { status, stderr, stdout };
  }

  it("prints the report from a baseline ref & exits 0 with the sprite check skipped", async () => {
    const result = await run(["base", "--skip-sprites"]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("`1.0.0` (`base`) to `1.1.0`");
    expect(result.stdout).toContain("| items | 2 | 2 | 1 | 1 |");
  });

  it("writes the report as UTF-8 to --out instead of standard output", async () => {
    const out = path.join(repository, "update-report.md");
    const result = await run(["base", "--skip-sprites", `--out=${out}`]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(readFileSync(out, "utf8")).toContain("## Game update review report");
  });

  it("exits 2 with usage for a missing ref, & 1 for an unknown ref", async () => {
    const noRef = await run([]);
    const unknownRef = await run(["no-such-ref", "--skip-sprites"]);

    expect(noRef.status).toBe(2);
    expect(unknownRef.status).toBe(1);
  });

  it("fails when no sprites are staged, rather than passing unchecked", async () => {
    const result = await run(["base", `--sprites=${path.join(repository, "missing")}`]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No staged sprites");

    const empty = path.join(repository, "empty");
    mkdirSync(empty);
    const emptyResult = await run(["base", `--sprites=${empty}`]);
    expect(emptyResult.status).toBe(1);
    expect(emptyResult.stderr).toContain("No staged sprites");
  });

  it("fails on a staged file the upload would refuse", async () => {
    const sprites = path.join(repository, "sprites");
    mkdirSync(path.join(sprites, "items"), { recursive: true });
    writeFileSync(path.join(sprites, "items", "trout.png"), "raw");

    const result = await run(["base", `--sprites=${sprites}`]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("non-.webp");
  });

  it("prints the report but fails while production lacks a staged sprite, & passes once it has it", async () => {
    const sprites = path.join(repository, "sprites");
    mkdirSync(path.join(sprites, "items"), { recursive: true });
    writeFileSync(path.join(sprites, "items", "trout.webp"), "pixels");
    const present = new Set<string>();
    const server = createServer((request, response) => {
      const known = present.has(new URL(request.url ?? "/", "http://x").pathname);
      response.statusCode = known ? 200 : 404;
      if (known) response.setHeader("etag", `"${md5("pixels")}"`);
      response.end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    const origin = `http://127.0.0.1:${String(typeof address === "object" ? address?.port : 0)}`;
    try {
      const pending = await run(["base", `--sprites=${sprites}`], { ASSET_ORIGIN: origin });
      expect(pending.status).toBe(1);
      expect(pending.stdout).toContain("would still send 1 of 1 staged sprites");
      expect(pending.stdout).toContain("`sprites/items/trout.webp`");

      present.add("/sprites/items/trout.webp");
      const clean = await run(["base", `--sprites=${sprites}`], { ASSET_ORIGIN: origin });
      expect(clean.status, clean.stderr).toBe(0);
      expect(clean.stdout).toContain("production has all 1 staged sprites");
    } finally {
      server.close();
    }
  });
});

function md5(contents: string): string {
  return createHash("md5").update(contents).digest("hex");
}
