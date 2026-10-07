import { describe, expect, it } from "vitest";

import { assembleTrackerData } from "../assemble.js";
import { evaluateExpressions } from "../evaluate.js";
import { forEachItem } from "../extractor-helpers.js";
import { createAssetsLocalizer } from "../localize.js";
import { parseFiddle } from "../parse-fiddle.js";
import { requireGameAssetsDir } from "../test-helpers.js";
import { validateReviewedGameFacts } from "./validate.js";

import type { ParsedGameData } from "../parse-fiddle.js";

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

  it.each(["quest", "equipment", "perk", "wedding"])(
    "fails when an excluded cosmetic gains a native %s reward",
    (encoding) => {
      const data = installedFacts();
      const misc = data.misc as Record<string, unknown>;
      if (encoding === "quest") {
        const quests = data.quests as Record<string, Record<string, Record<string, unknown>>>;
        quests.story_quests.repair_the_bridge.rewards = [{ player_cosmetic: "head_flower_hat" }];
      } else if (encoding === "equipment") {
        let changed = false;
        forEachItem(data, (_id, item) => {
          if (!changed && item.cosmetic_to_unlock) {
            item.cosmetic_to_unlock = "head_flower_hat";
            changed = true;
          }
        });
      } else if (encoding === "perk") {
        misc.earthly_essence = { spring: [{ inner_data: "head_flower_hat", item_id: "cosmetic" }] };
      } else {
        misc.wedding_assets = ["head_flower_hat"];
      }
      expect(() => {
        assembleTrackerData(data, createAssetsLocalizer(requireGameAssetsDir()), {
          version: "1.0.5",
        });
      }).toThrow("Obsolete reviewed cosmetic exclusion entry");
    },
  );

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
