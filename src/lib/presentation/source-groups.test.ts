import { beforeEach, describe, expect, it } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";

import { projectSourceGroups, sourceInstances } from "./source-groups.js";

import type { Source } from "#lib/types/acquisition.js";

import type { SourceGroupRow } from "./source-groups.js";

const source = (value: unknown): Source => value as Source;
const row = (key: string, sources: Source[], completed = false): SourceGroupRow => ({
  completed,
  key,
  obtainable: true,
  sources,
});

beforeEach(() => {
  userState.resetAll();
});

describe("source instances", () => {
  it("splits locations and water types, and keeps named instances stable across facets", () => {
    expect(
      sourceInstances(source({ type: "forage", locationIds: ["beach", "narrows"] })).map(
        (s) => s.id,
      ),
    ).toEqual(["forage-beach", "forage-narrows"]);
    expect(
      sourceInstances(source({ type: "fish", waterTypes: ["ocean", "river"] })).map((s) => s.id),
    ).toEqual(["fish-ocean", "fish-river"]);
    expect(
      sourceInstances(
        source({
          type: "store",
          availability: { type: "season", seasons: ["spring"] },
          storeId: "balor",
        }),
      )[0].id,
    ).toBe("store-balor");
    expect(
      sourceInstances(
        source({ type: "scroll_bundle", bundleItemId: "scrolls", storeId: "balor" }),
      )[0].id,
    ).toBe("store-balor");
    expect(sourceInstances(source({ type: "mines_chest", biomeId: "upper" }))[0].id).toBe(
      "mine-upper",
    );
  });
});

describe("source projection", () => {
  it("duplicates a row by source, deduplicates seasonal stock within one source, and uses that source’s window", () => {
    const rows = [
      row("chair", [
        source({
          type: "store",
          availability: { type: "season", seasons: ["winter"] },
          storeId: "balor",
        }),
        source({
          type: "store",
          availability: { type: "season", seasons: ["fall"] },
          storeId: "balor",
        }),
        source({ type: "store", storeId: "merri" }),
      ]),
    ];
    const sections = projectSourceGroups(rows, userState.progressContext);
    expect(sections.map((s) => s.id)).toEqual(["store-balor", "store-merri"]);
    expect(sections[0].rows).toHaveLength(1);
    expect(sections[0].rows[0].window).toBe("later");
    expect(sections[0].state).toBe("later");
    expect(sections[1].rows[0].window).toBe("anytime");
    expect(sections[1].state).toBe("now");
    rows[0].completed = true;
    expect(
      projectSourceGroups(rows, userState.progressContext).map((s) => [s.state, s.completed]),
    ).toEqual([
      ["done", 1],
      ["done", 1],
    ]);
  });

  it("excludes unobtainable rows from counts and rollups", () => {
    const rows = [
      row("done", [source({ type: "store", storeId: "balor" })], true),
      { ...row("unobtainable", [source({ type: "store", storeId: "balor" })]), obtainable: false },
    ];
    const [section] = projectSourceGroups(rows, userState.progressContext);
    expect(section.total).toBe(1);
    expect(section.completed).toBe(1);
    expect(section.state).toBe("done");
  });

  it("keeps source spoilers independent of row spoilers and rolls hidden rows into Later", () => {
    const gate = { type: "mineFloor", floor: 999 } as const;
    const rows = [
      { ...row("secret", [source({ type: "store", storeId: "balor" })]), visibility: gate },
    ];
    const [section] = projectSourceGroups(rows, userState.progressContext);
    expect(section.spoilered).toBe(false);
    expect(section.state).toBe("later");
    const [hidden] = projectSourceGroups(
      [row("a", [source({ type: "store", storeId: "balor", visibility: gate })])],
      userState.progressContext,
    );
    expect(hidden.spoilered).toBe(true);
  });

  it("retains unsourced rows in Progress and scopes filters to the source section", () => {
    const rows = [
      row("quest", []),
      row("multi", [
        source({ type: "store", storeId: "balor" }),
        source({ type: "fish", waterTypes: ["ocean"] }),
      ]),
    ];
    const sections = projectSourceGroups(rows, userState.progressContext, (sources) =>
      sources.every((s) => s.type !== "store"),
    );
    expect(sections.map((s) => s.id)).toEqual(["progress", "fish-ocean"]);
  });
});
