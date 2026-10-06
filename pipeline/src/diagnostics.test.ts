import { describe, expect, it } from "vitest";

import { PipelineDiagnostics } from "./diagnostics.js";

const diagnostic = {
  fieldPath: "items.other.materials.test",
  kind: "biome-less-forageable",
  message: "No biome",
  targetId: "test",
} as const;
const reviewed = {
  ...diagnostic,
  evidence: "Native item location and reviewed acquisition override",
  reason: "Known asset omission",
};

describe("pipeline diagnostics", () => {
  it("passes clean data", () => {
    expect(() => {
      new PipelineDiagnostics().validate();
    }).not.toThrow();
  });

  it("rejects an unreviewed diagnostic", () => {
    const diagnostics = new PipelineDiagnostics();
    diagnostics.add(diagnostic);
    expect(() => {
      diagnostics.validate();
    }).toThrow(/biome-less-forageable.*test/);
  });

  it("allows only an exact reviewed diagnostic", () => {
    const diagnostics = new PipelineDiagnostics([reviewed]);
    diagnostics.add(diagnostic);
    expect(() => {
      diagnostics.validate();
    }).not.toThrow();
  });

  it.each(["message", "fieldPath", "targetId"] as const)("rejects drift in %s", (field) => {
    const diagnostics = new PipelineDiagnostics([reviewed]);
    diagnostics.add({ ...diagnostic, [field]: "changed" });
    expect(() => {
      diagnostics.validate();
    }).toThrow(/Pipeline diagnostics/);
  });

  it("rejects obsolete allowlist entries", () => {
    expect(() => {
      new PipelineDiagnostics([reviewed]).validate();
    }).toThrow(/Obsolete/);
  });

  it.each(["missing-target", "obsolete-override"] as const)("never allows %s", (kind) => {
    expect(() => new PipelineDiagnostics([{ ...reviewed, kind }])).toThrow(/cannot be allowlisted/);
  });

  it.each(["reason", "evidence"] as const)("requires %s", (field) => {
    expect(() => new PipelineDiagnostics([{ ...reviewed, [field]: "" }])).toThrow(
      /reason.*evidence/,
    );
  });
});
