import { beforeEach, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { animalNameId, getName } from "#lib/data/names.js";
import { projectSourceGroups } from "#lib/presentation/source-groups.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { recordEntries, recordKeys } from "#lib/utils/record.js";

import { buildSourceChecklist } from "./source-checklist.js";

beforeEach(() => {
  userState.resetAll();
});

it("preserves variant discovery spoilers & species context outside the animal’s section", () => {
  const fixture = recordEntries(trackerData.animals).find(
    ([, animal]) => animal.variantTiers.length > 2,
  );
  if (!fixture) throw new Error("No multi-tier animal fixture");
  const [animalId, animal] = fixture;
  const variantId = recordKeys(animal.variantTiers[1])[0];
  const find = () =>
    buildSourceChecklist(userState.progressContext, "en").find(
      (row) => row.id === `${animalId}/${variantId}`,
    );
  const hidden = find();
  expect(hidden?.spoilered).toBe(true);
  expect(hidden?.subtitle).toContain(getName("animals", animalNameId(animalId, "core"), "en"));
  expect(hidden?.searchNames).toContain(getName("animals", animalNameId(animalId, "core"), "en"));
  const placement = projectSourceGroups(
    buildSourceChecklist(userState.progressContext, "en"),
    userState.progressContext,
  )
    .flatMap((section) => section.rows)
    .find(({ entry }) => entry.key === hidden?.key);
  expect(placement?.window).toBe("later");
  userState.toggleShowSpoilers();
  expect(find()?.spoilered).toBe(false);
  userState.toggleShowSpoilers();
  userState.toggleAnimalVariant(animalId, recordKeys(animal.variantTiers[0])[0]);
  expect(find()?.spoilered).toBe(false);
  userState.toggleAnimalVariant(animalId, variantId);
  expect(find()?.spoilered).toBe(false);
});

it("labels animal cosmetics with their localized species", () => {
  const fixture = recordEntries(trackerData.animals).find(
    ([, animal]) => recordKeys(animal.cosmetics).length > 0,
  );
  if (!fixture) throw new Error("No animal cosmetic fixture");
  const [animalId, animal] = fixture;
  const cosmeticId = recordKeys(animal.cosmetics)[0];
  const row = buildSourceChecklist(userState.progressContext, "en").find(
    (candidate) => candidate.id === `${animalId}/${cosmeticId}`,
  );
  expect(row?.subtitle).toContain(getName("animals", animalNameId(animalId, "core"), "en"));
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

it("carries an almanac row’s variant as its subtitle & a search term", () => {
  const rows = buildSourceChecklist(userState.progressContext, "en");
  expect(rows.find((row) => row.id === "animated_cloud_window_v1_oak")).toMatchObject({
    name: "Animated Clouds Window",
    searchTerms: ["Oak"],
    subtitle: "Oak",
  });
  const turnip = rows.find((row) => row.category === "almanac" && row.id === "turnip");
  expect(turnip?.subtitle).toBeUndefined();
  expect(turnip?.searchTerms).toBeUndefined();
});
