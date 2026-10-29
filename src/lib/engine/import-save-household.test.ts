import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { recordEntries } from "#lib/utils/record.js";

import { extractSave } from "./import-save.js";

const statuses = Object.fromEntries(
  recordEntries(trackerData.villagers)
    .filter(([, villager]) => villager.dateable)
    .map(([id]) => [`${id}_status`, null]),
);

describe("household save facts", () => {
  it.each([1, true])(
    "reads an accepted stork visit %s before pending_child exists",
    (pending_stork_visit) => {
      const { fields } = extractSave({ gamedata: { t2_world_facts: { pending_stork_visit } } });
      expect(fields.childChoice).toMatchObject({ completeness: "complete", value: "yes" });
    },
  );

  it.each([0, false, undefined, "yes", 2])(
    "does not invent a choice from stork visit %s",
    (pending_stork_visit) => {
      const { fields } = extractSave({ gamedata: { t2_world_facts: { pending_stork_visit } } });
      expect(fields.childChoice).toMatchObject({ completeness: "unknown", value: undefined });
    },
  );

  it.each([
    [null, undefined],
    ["best_friend", "platonic"],
    ["dating", "romantic"],
    ["fiance", "proposed"],
    ["spouse", "married"],
  ])("reads explicit status %s completely, overriding stale flags", (status, expected) => {
    const { fields } = extractSave({
      gamedata: {
        t2_world_facts: {
          ...statuses,
          adeline_is_spouse: 1,
          adeline_status: status,
        },
      },
    });
    expect(fields.villagerRelationships.completeness).toBe("complete");
    expect(
      fields.villagerRelationships.value?.["adeline" as keyof typeof trackerData.villagers],
    ).toBe(expected);
  });

  it.each([undefined, "divorced", false, 4])(
    "keeps missing or unrecognized status %s partial",
    (status) => {
      const { fields } = extractSave({
        gamedata: {
          t2_world_facts: {
            ...statuses,
            adeline_is_dating: 1,
            adeline_status: status,
          },
        },
      });
      expect(fields.villagerRelationships.completeness).toBe("unknown");
      expect(fields.villagerRelationships.diagnostics).toContainEqual({
        code: status === undefined ? "absent" : "invalid-value",
        path: "gamedata.t2_world_facts.adeline_status",
      });
    },
  );

  it.each([
    [null, undefined],
    ["best_friend", "platonic"],
    ["dating", "romantic"],
    ["fiance", "proposed"],
  ])("preserves explicit status %s when a pregnancy quest contradicts it", (status, expected) => {
    const [villagerId, questId] = recordEntries(trackerData.pregnancyQuestByVillager)[0];
    const { fields } = extractSave({
      gamedata: { t2_world_facts: { ...statuses, [`${villagerId}_status`]: status } },
      quests: { active_quests: [], completed_quests: [questId] },
    });
    expect(fields.villagerRelationships.value?.[villagerId]).toBe(expected);
    expect(fields.villagerRelationships.completeness).toBe("unknown");
    expect(fields.villagerRelationships.diagnostics).toContainEqual({
      code: "invalid-value",
      path: `gamedata.t2_world_facts.${villagerId}_status`,
    });
  });

  it("keeps an explicit spouse complete when a pregnancy quest agrees", () => {
    const [villagerId, questId] = recordEntries(trackerData.pregnancyQuestByVillager)[0];
    const { fields } = extractSave({
      gamedata: { t2_world_facts: { ...statuses, [`${villagerId}_status`]: "spouse" } },
      quests: { active_quests: [], completed_quests: [questId] },
    });
    expect(fields.villagerRelationships).toMatchObject({
      completeness: "complete",
      value: { [villagerId]: "married" },
    });
  });

  it("does not manufacture child evidence from malformed values", () => {
    for (const pending_child of [false, 0, "soon", [], {}]) {
      const { fields } = extractSave({
        player: { children: [], items_acquired: [], pending_child },
      });
      expect(fields.childChoice.value).not.toBe("yes");
      expect(fields.childChoice.completeness).toBe("unknown");
    }
  });

  it.each(["ari", "spouse", "stork"])("reads serialized utero %s as wanting a child", (utero) => {
    const { fields } = extractSave({
      player: { children: [], items_acquired: [], pending_child: { due_date: 123, utero } },
    });
    expect(fields.childChoice).toMatchObject({ completeness: "complete", value: "yes" });
  });

  it.each([0, "unknown", null])("rejects an unrecognized serialized utero %s", (utero) => {
    const { fields } = extractSave({
      player: { children: [], items_acquired: [], pending_child: { due_date: 123, utero } },
    });
    expect(fields.childChoice).toMatchObject({ completeness: "unknown", value: undefined });
  });

  it.each([undefined, "yes", 2, null])("keeps an unreadable Mistmare fact %s partial", (value) => {
    const { fields } = extractSave({
      gamedata: { t2_world_facts: { cutscene_seen_reveal_mistmare: value } },
    });
    expect(fields.mountAppearances.completeness).toBe("unknown");
    expect(fields.mountAppearances.diagnostics).toContainEqual({
      code: value === undefined ? "absent" : "invalid-value",
      path: "gamedata.t2_world_facts.cutscene_seen_reveal_mistmare",
    });
  });
});
