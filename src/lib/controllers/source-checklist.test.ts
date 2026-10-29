import { beforeEach, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { projectSourceGroups } from "#lib/presentation/source-groups.js";
import { userState } from "#lib/stores/user-state.svelte.js";

import { buildSourceChecklist } from "./source-checklist.js";

beforeEach(() => {
  userState.resetAll();
});

it("projects tracked categories once per completion identity and includes every named source", () => {
  const rows = buildSourceChecklist(userState.progressContext, "en");
  expect(rows.length).toBeGreaterThan(1000);
  expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  expect(new Set(rows.map((row) => row.category))).toEqual(
    new Set(["almanac", "museum", "recipes", "cosmetics", "animals", "quests", "mines"]),
  );
  const sections = projectSourceGroups(rows, userState.progressContext);
  expect(sections.find((s) => s.id === "store-balor")?.rows.length).toBeGreaterThan(0);
  expect(sections.find((s) => s.id === "fish-ocean")?.rows.length).toBeGreaterThan(0);
  for (const { id } of trackerData.mines.biomes) {
    expect(sections.find((s) => s.id === `mine-${id}`)?.rows.length).toBeGreaterThan(0);
  }
  expect(sections.some((s) => s.id.startsWith("festival-"))).toBe(true);
});

it("writes through the category’s existing toggle and returns an exact undo", () => {
  const rows = buildSourceChecklist(userState.progressContext, "en");
  const candidate = rows.find(
    (row) =>
      row.category === "almanac" &&
      !row.completed &&
      row.sources.some((s) => s.type === "store" && s.storeId === "balor"),
  );
  expect(candidate).toBeDefined();
  if (!candidate) throw new Error("Missing Balor fixture");
  const undo = candidate.toggle();
  const after = buildSourceChecklist(userState.progressContext, "en").find(
    (r) => r.key === candidate.key,
  );
  expect(after?.completed).toBe(true);
  undo();
  expect(
    buildSourceChecklist(userState.progressContext, "en").find((r) => r.key === candidate.key)
      ?.completed,
  ).toBe(false);
});
