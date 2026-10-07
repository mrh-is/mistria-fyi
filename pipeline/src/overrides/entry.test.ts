import { describe, expect, it } from "vitest";

import { entriesToRecord, validateReviewedEntries } from "./entry.js";

const entry = { evidence: "native table inspected", id: "one", reason: "runtime-only", value: 1 };

describe("reviewed entries", () => {
  it("requires an independently present native target", () => {
    expect(() => {
      validateReviewedEntries("test", [entry], new Set(), () => false);
    }).toThrow("Missing reviewed test target");
  });

  it("fails when native data gains the reviewed fact", () => {
    expect(() => {
      validateReviewedEntries("test", [entry], new Set(["one"]), () => true);
    }).toThrow("Obsolete reviewed test entry");
  });

  it("requires provenance and unique IDs", () => {
    expect(() => {
      validateReviewedEntries("test", [{ ...entry, evidence: "" }], new Set(["one"]), () => false);
    }).toThrow("Invalid or duplicate");
    expect(() => {
      validateReviewedEntries("test", [entry, entry], new Set(["one"]), () => false);
    }).toThrow("Invalid or duplicate");
  });

  it("projects validated values without provenance in output", () => {
    validateReviewedEntries("test", [entry], new Set(["one"]), () => false);
    expect(entriesToRecord([entry])).toEqual({ one: 1 });
  });
});
