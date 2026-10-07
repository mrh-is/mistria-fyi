import { describe, expect, it } from "vitest";

import { evaluateExpressions } from "../parse/evaluate.js";
import { parseFiddle } from "../parse/parse-fiddle.js";
import { requireGameAssetsDir } from "../test-helpers.js";
import { validateReviewedGameFacts } from "./validate.js";

import type { ParsedGameData } from "../parse/parse-fiddle.js";

function installedFacts(): ParsedGameData {
  const { data } = parseFiddle(requireGameAssetsDir());
  evaluateExpressions(data);
  return data;
}

describe("reviewed game facts against installed assets", () => {
  it("validates every current target & provenance", () => {
    expect(() => {
      validateReviewedGameFacts(installedFacts());
    }).not.toThrow();
  });

  it("fails when a reviewed target disappears", () => {
    const data = installedFacts();
    delete (data.stores as Record<string, unknown>).darcy;
    expect(() => {
      validateReviewedGameFacts(data);
    }).toThrow("Missing reviewed store gate target");
  });

  it("fails when a native store acquires the reviewed unlock gate", () => {
    const data = installedFacts();
    (data.stores as Record<string, Record<string, unknown>>).darcy.requirements = {
      completed_quest: "repair_the_bridge",
    };
    expect(() => {
      validateReviewedGameFacts(data);
    }).toThrow("Obsolete reviewed store gate entry");
  });

  it("fails when an excluded cosmetic gains a native reward", () => {
    const data = installedFacts();
    const quests = data.quests as Record<string, Record<string, Record<string, unknown>>>;
    quests.story_quests.repair_the_bridge.rewards = [{ cosmetic: "head_flower_hat" }];
    expect(() => {
      validateReviewedGameFacts(data);
    }).toThrow("Obsolete reviewed cosmetic exclusion entry");
  });

  it("fails when a native golden product gains its reviewed animal owner", () => {
    const data = installedFacts();
    const items = data.items as Record<
      string,
      Record<string, Record<string, Record<string, unknown>>>
    >;
    for (const categories of Object.values(items)) {
      for (const entries of Object.values(categories)) {
        if (entries.golden_egg) entries.golden_egg.animal_product = "chicken";
      }
    }
    expect(() => {
      validateReviewedGameFacts(data);
    }).toThrow("Obsolete reviewed golden animal product entry");
  });
});
