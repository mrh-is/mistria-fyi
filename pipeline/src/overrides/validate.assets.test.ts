import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { assembleTrackerData } from "../assemble.js";
import { forEachItem } from "../extractor-helpers.js";
import { CURRENT_GAME_VERSION } from "../game-version.js";
import { createAssetsLocalizer } from "../localize/localize.js";
import { evaluateExpressions } from "../parse/evaluate.js";
import { parseFiddle } from "../parse/parse-fiddle.js";
import { requireGameAssetsDir } from "../test-helpers.js";
import { HORSE_STATUE_ESSENCE_COST } from "./game-facts.js";
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

  it("charges the reviewed essence cost at the Horse Statue", () => {
    const gml = readFileSync(
      join(requireGameAssetsDir(), "gml", "objects", "obj_horse_statue.gml"),
      "utf8",
    );
    expect(gml).toContain(`ARI.modify_essence(-${String(HORSE_STATUE_ESSENCE_COST)})`);
    expect(gml).toContain('create_default_mount("mistmare")');
  });

  it("sells the Mistmare's perks only once the player has the mount", () => {
    const gml = readFileSync(
      join(requireGameAssetsDir(), "gml", "objects", "obj_horse_statue.gml"),
      "utf8",
    );
    // `extractMount` names the Mistmare as each perk's prerequisite on the strength of this gate.
    expect(gml).toMatch(
      /ShrineMenuVariant\.Horse\);\s*\},\s*function\(\) \{\s*return ARI\.mount != undefined;/,
    );
  });

  it("fails when a reviewed mount appearance becomes acquirable", () => {
    const data = installedFacts();
    const horse = (data.ranching as Record<string, Record<string, Record<string, unknown>>>).animals
      .horse;
    (horse.variants as Record<string, Record<string, unknown>>).mistmare.acquirable = true;
    expect(() => {
      validateReviewedGameFacts(data);
    }).toThrow("mount appearance");
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
          version: CURRENT_GAME_VERSION,
        });
      }).toThrow("Obsolete reviewed cosmetic exclusion entry");
    },
  );

  it("fails when an excluded item gains a native chicken statue reward", () => {
    const data = installedFacts();
    const legendary = (data.chicken_statue as Record<string, Record<string, unknown[]>>).legendary;
    legendary.large_roll.push({ item: "gold_chest" });
    expect(() => {
      assembleTrackerData(data, createAssetsLocalizer(requireGameAssetsDir()), {
        version: CURRENT_GAME_VERSION,
      });
    }).toThrow(
      "Obsolete reviewed item exclusion entry now encoded in native acquisition sources: gold_chest",
    );
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
