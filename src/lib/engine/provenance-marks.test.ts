import { describe, expect, it } from "vitest";

import { provenanceMark } from "./provenance-marks.js";

import type { MarkInput } from "./provenance-marks.js";
import type { ProvenanceSource } from "./provenance.js";

const SOURCES: ProvenanceSource[] = ["inferred", "manual", "save", "unknown"];

function mark(input: Partial<MarkInput> = {}) {
  return provenanceMark({
    fact: "almanac/turnip",
    source: "manual",
    state: "checked",
    twoMoments: false,
    ...input,
  });
}

describe("provenanceMark", () => {
  it.each(SOURCES)("draws the same %s mark for the same fact", (source) => {
    expect(mark({ source })).toEqual(mark({ source }));
  });

  it.each(SOURCES)("varies a %s mark from fact to fact", (source) => {
    const marks = ["a", "b", "c", "d", "e", "f"].map((id) =>
      JSON.stringify(mark({ fact: `almanac/${id}`, source })),
    );
    expect(new Set(marks).size).toBeGreaterThan(1);
  });

  it("pins the pen's geometry, since the draw order fixes every shipped mark", () => {
    expect(mark()).toMatchSnapshot();
  });

  it.each(SOURCES)("keeps a quest's %s slash when the quest is finished", (source) => {
    const fact = "questStates/bait";
    const [slash] = mark({ fact, source, state: "obtained", twoMoments: true });
    const finished = mark({ fact, source, twoMoments: true });

    expect(finished[0]).toEqual(slash);
    expect(finished).toHaveLength(2);
    expect(finished[1].transform).toBeTruthy();
  });

  it("draws each moment in its own tool when a quest's sources differ", () => {
    const fact = "questStates/bait";
    const [slash] = mark({ fact, source: "save", state: "obtained", twoMoments: true });
    const finished = mark({ fact, obtainedSource: "save", source: "manual", twoMoments: true });

    expect(finished[0]).toEqual(slash);
    expect(finished[1].filter).toContain("mark-pen-");
  });

  it("draws both strokes in the quest's source when its obtained moment is unrecorded", () => {
    const layers = mark({ fact: "questStates/bait", source: "save", twoMoments: true });

    expect(layers.map(({ filter }) => filter.split("-")[1])).toEqual(["stamp", "stamp"]);
  });

  it("stays within the stamp's fade range, and only the stamp has one", () => {
    for (const id of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      const [layer] = mark({ fact: `almanac/${id}`, source: "save" });
      expect(layer.pressure?.end).toBeGreaterThanOrEqual(Math.round(255 * 0.55));
      expect(layer.pressure?.end).toBeLessThanOrEqual(255);
    }
    expect(mark({ source: "manual" })[0].pressure).toBeUndefined();
  });

  it("draws the colored pencil at 75% of the pen's strength", () => {
    expect(mark({ source: "inferred" })[0].opacity).toBe(0.75);
  });
});
