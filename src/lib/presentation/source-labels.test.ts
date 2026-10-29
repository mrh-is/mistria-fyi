import { beforeEach, expect, it } from "vitest";

import { buildSourceChecklist } from "#lib/controllers/source-checklist.js";
import { trackerData } from "#lib/data/index.js";
import { loadNames, NAME_CHUNKS } from "#lib/data/names.js";
import { projectSourceGroups } from "#lib/presentation/source-groups.js";
import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { LOCALE_CODES } from "#lib/types/locale.js";

import { compareSourceSections, sourceSectionLabel } from "./source-labels.js";

beforeEach(() => {
  userState.resetAll();
});

it.each(LOCALE_CODES)(
  "resolves every source label in %s, with hidden sources redacted",
  async (locale) => {
    await loadNames(locale, NAME_CHUNKS);
    const entries = buildSourceChecklist(userState.progressContext, locale);
    const sections = projectSourceGroups(entries, userState.progressContext);
    expect(sections.length).toBeGreaterThan(100);
    const lookups = buildBaseSegmentLookups(
      computeSpoileredStoreIds(userState.progressionState),
      locale,
    );
    const labels = sections.map((section) =>
      sourceSectionLabel(section, lookups, userState.progressionState),
    );
    expect(labels.every(({ name }) => name.length > 0)).toBe(true);
    const wheedle = sections.find((s) => s.id === "store-wheedle");
    expect(wheedle).toBeDefined();
    if (!wheedle) throw new Error("Missing Wheedle source");
    expect(sourceSectionLabel(wheedle, lookups, userState.progressionState).spoilered).toBe(true);
  },
);

it("orders festivals by calendar, biomes by depth, and completed sources last", () => {
  const sections = projectSourceGroups(
    buildSourceChecklist(userState.progressContext, "en"),
    userState.progressContext,
  );
  const wrap = (id: string) => {
    const section = sections.find((s) => s.id === id);
    if (!section) throw new Error(`Missing section ${id}`);
    return { name: id, section };
  };
  const biomes = trackerData.mines.biomes.map(({ id }) => wrap(`mine-${id}`));
  expect(biomes.toReversed().toSorted((a, b) => compareSourceSections(a, b, "en"))).toEqual(biomes);
  const [first, second] = biomes;
  expect(
    compareSourceSections({ ...first, section: { ...first.section, state: "done" } }, second, "en"),
  ).toBeGreaterThan(0);
});
