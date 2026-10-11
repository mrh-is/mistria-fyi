import { describe, expect, it } from "vitest";

import { requireGameAssetsDir } from "../test-helpers.js";
import { parseFiddle } from "./parse-fiddle.js";
import { buildRequirementDefinitions, parseRequirements } from "./requirements.js";

describe("requirements — v1.0.6 assets", () => {
  it("classifies and resolves the complete requirements registry", () => {
    const parsed = parseFiddle(requireGameAssetsDir());
    const requirementsData = parsed.data.requirements as Record<string, unknown>;
    expect(requirementsData).toBeDefined();

    const { namedRequirements, primitivePredicates } =
      buildRequirementDefinitions(requirementsData);
    expect(primitivePredicates.size).toBeGreaterThan(30);
    expect(Object.keys(namedRequirements).length).toBeGreaterThan(20);

    const result = parseRequirements(
      { repaired_general_store: true },
      namedRequirements,
      primitivePredicates,
      { entityId: "test", fieldPath: "requirements", sourcePath: "stores.toml" },
    );
    expect(result).toEqual({
      predicate: "seen_cutscene",
      value: "repair_the_general_store_pt_2",
    });
  });
});
