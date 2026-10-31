import { afterEach, describe, expect, it } from "vitest";

import { resolutionHolds } from "#lib/engine/provenance.js";
import { userState } from "#lib/stores/user-state.svelte.js";

import type { ItemId, PerkId, QuestId, RecipeId, VillagerId } from "#lib/types/tracker-data.js";

const TURNIP = "turnip" as ItemId;
const POTATO = "potato" as ItemId;
const ONE_REWARD_QUEST = "bell_berry_bakewell_tart_challenge" as QuestId;
const ONE_REWARD_RECIPE = "kitchen_herb_planter" as RecipeId;

afterEach(() => {
  userState.resetAll();
});

describe("provenance", () => {
  it("records a manual tick & untick, with no playtime before any save", () => {
    userState.toggleAlmanacItem(TURNIP);
    expect(userState.provenanceOf("almanac/turnip")).toEqual({ source: "manual" });

    userState.mergeFromSave({ mineFloor: 10 }, { playtime: 3600 });
    userState.toggleAlmanacItem(TURNIP);

    expect(userState.state.progress.almanac.has(TURNIP)).toBe(false);
    expect(userState.provenanceOf("almanac/turnip")).toEqual({ playtime: 3600, source: "manual" });
  });

  it("records a save's facts with its playtime, which later edits are stamped with", () => {
    userState.mergeFromSave({ mineFloor: 10 }, { playtime: 3600 });
    userState.setRenown(3);

    expect(userState.lastSavePlaytime).toBe(3600);
    expect(userState.provenanceOf("mineFloor")).toEqual({ playtime: 3600, source: "save" });
    expect(userState.provenanceOf("renown")).toEqual({ playtime: 3600, source: "manual" });
  });

  it("records only the facts a save changes", () => {
    userState.toggleAlmanacItem(TURNIP);

    userState.mergeFromSave({ almanac: new Set([POTATO, TURNIP]) }, { playtime: 60 });

    expect(userState.provenanceOf("almanac/turnip")).toEqual({ source: "manual" });
    expect(userState.provenanceOf("almanac/potato")).toEqual({ playtime: 60, source: "save" });
  });

  it("records a transfer's facts as unknown & keeps the last save's playtime", () => {
    userState.mergeFromSave({ mineFloor: 10 }, { playtime: 100 });

    userState.mergeFromSave({ renown: 4 }, { source: "unknown" });

    expect(userState.provenanceOf("renown")).toEqual({ playtime: 100, source: "unknown" });
    expect(userState.lastSavePlaytime).toBe(100);
  });

  it("records a save without a readable playtime unstamped, leaving the last one in place", () => {
    userState.mergeFromSave({ mineFloor: 10 }, { playtime: 100 });

    userState.mergeFromSave({ renown: 4 });

    expect(userState.provenanceOf("renown")).toEqual({ source: "save" });
    expect(userState.lastSavePlaytime).toBe(100);
  });

  it("records the relationship set by hand as manual & its marriage cascade as inferred", () => {
    const balor = "balor" as VillagerId;
    userState.setVillagerRelationship(balor, "romantic");
    userState.setChildChoice("yes");

    userState.setVillagerRelationship("adeline" as VillagerId, "married");

    expect(userState.provenanceOf("villagerRelationships/adeline")?.source).toBe("manual");
    expect(userState.state.progress.villagerRelationships[balor]).toBe("platonic");
    expect(userState.provenanceOf("villagerRelationships/balor")?.source).toBe("inferred");
    expect(userState.state.progress.childChoice).toBe("undeclared");
    expect(userState.provenanceOf("childChoice")?.source).toBe("inferred");
  });

  it("records a quest as manual & the recipe rewards it adds or takes back as inferred", () => {
    userState.completeQuestWithRecipes(ONE_REWARD_QUEST);
    const completion = userState.completeQuestWithRecipes(ONE_REWARD_QUEST);
    expect(completion.newlyAdded).toEqual([ONE_REWARD_RECIPE]);
    expect(userState.provenanceOf(`questStates/${ONE_REWARD_QUEST}`)?.source).toBe("manual");
    expect(userState.provenanceOf(`almanacRecipes/${ONE_REWARD_RECIPE}`)?.source).toBe("inferred");

    userState.setRenown(1);
    userState.mergeFromSave({ mineFloor: 1 }, { playtime: 5 });
    userState.undoQuestWithRecipes(ONE_REWARD_QUEST, completion);

    expect(userState.state.progress.almanacRecipes.has(ONE_REWARD_RECIPE)).toBe(false);
    expect(userState.provenanceOf(`questStates/${ONE_REWARD_QUEST}`)).toEqual({
      playtime: 5,
      source: "manual",
    });
    expect(userState.provenanceOf(`almanacRecipes/${ONE_REWARD_RECIPE}`)).toEqual({
      playtime: 5,
      source: "inferred",
    });
  });

  it("keeps a quest's obtained moment's source when another source finishes it", () => {
    const key = `questStates/${ONE_REWARD_QUEST}`;
    userState.mergeFromSave({ questStates: { [ONE_REWARD_QUEST]: "obtained" } }, { playtime: 5 });
    expect(userState.provenanceOf(key)).toEqual({ playtime: 5, source: "save" });

    const completion = userState.completeQuestWithRecipes(ONE_REWARD_QUEST);
    expect(userState.provenanceOf(key)).toEqual({
      obtainedSource: "save",
      playtime: 5,
      source: "manual",
    });

    // Undoing the finish is a manual edit, so the slash is the player's now.
    userState.undoQuestWithRecipes(ONE_REWARD_QUEST, completion);
    expect(userState.provenanceOf(key)).toEqual({ playtime: 5, source: "manual" });
  });

  it("records no obtained source when one source obtains & finishes a quest", () => {
    userState.completeQuestWithRecipes(ONE_REWARD_QUEST);
    userState.completeQuestWithRecipes(ONE_REWARD_QUEST);

    expect(userState.provenanceOf(`questStates/${ONE_REWARD_QUEST}`)).toEqual({
      source: "manual",
    });
  });

  it("promotes an unknown fact a save agrees with, stamped with its playtime", () => {
    userState.mergeFromSave({ almanac: new Set([TURNIP, POTATO]) }, { source: "unknown" });
    expect(userState.provenanceOf("almanac/turnip")).toEqual({ source: "unknown" });

    userState.mergeFromSave({ almanac: new Set([TURNIP]) }, { playtime: 5 });

    expect(userState.provenanceOf("almanac/turnip")).toEqual({ playtime: 5, source: "save" });
    expect(userState.provenanceOf("almanac/potato")).toEqual({ source: "unknown" });
  });

  it("promotes an inferred fact a save agrees with", () => {
    const recipe = `almanacRecipes/${ONE_REWARD_RECIPE}`;
    userState.completeQuestWithRecipes(ONE_REWARD_QUEST);
    userState.completeQuestWithRecipes(ONE_REWARD_QUEST);
    expect(userState.provenanceOf(recipe)?.source).toBe("inferred");

    userState.mergeFromSave({ almanacRecipes: new Set([ONE_REWARD_RECIPE]) }, { playtime: 5 });

    expect(userState.provenanceOf(recipe)).toEqual({ playtime: 5, source: "save" });
  });

  it("stamps a guessed slash under a pen X when a save agrees with the finish", () => {
    const key = `questStates/${ONE_REWARD_QUEST}`;
    userState.mergeFromSave(
      { questStates: { [ONE_REWARD_QUEST]: "obtained" } },
      { source: "unknown" },
    );
    userState.completeQuestWithRecipes(ONE_REWARD_QUEST);
    expect(userState.provenanceOf(key)).toEqual({ obtainedSource: "unknown", source: "manual" });

    userState.mergeFromSave({ questStates: { [ONE_REWARD_QUEST]: "completed" } }, { playtime: 5 });

    expect(userState.provenanceOf(key)).toEqual({ obtainedSource: "save", source: "manual" });
  });

  it("keeps a pen slash under a save's finish through later saves", () => {
    const key = `questStates/${ONE_REWARD_QUEST}`;
    const completed = { questStates: { [ONE_REWARD_QUEST]: "completed" as const } };
    userState.setQuestState(ONE_REWARD_QUEST, "obtained");

    userState.mergeFromSave(completed, { playtime: 5 });
    userState.mergeFromSave(completed, { playtime: 6 });

    expect(userState.provenanceOf(key)).toEqual({
      obtainedSource: "manual",
      playtime: 5,
      source: "save",
    });
  });

  it("replaces a guessed slash when a save finishes the quest", () => {
    const key = `questStates/${ONE_REWARD_QUEST}`;
    userState.mergeFromSave(
      { questStates: { [ONE_REWARD_QUEST]: "obtained" } },
      { source: "unknown" },
    );

    userState.mergeFromSave({ questStates: { [ONE_REWARD_QUEST]: "completed" } }, { playtime: 5 });

    expect(userState.provenanceOf(key)).toEqual({ playtime: 5, source: "save" });
  });

  it("doesn't promote a fact the save reports differently", () => {
    const key = `questStates/${ONE_REWARD_QUEST}`;
    const completed = { questStates: { [ONE_REWARD_QUEST]: "completed" as const } };
    userState.mergeFromSave(completed, { source: "unknown" });

    userState.mergeFromSave({ questStates: { [ONE_REWARD_QUEST]: "obtained" } }, { playtime: 5 });

    expect(userState.provenanceOf(key)).toEqual({ source: "unknown" });
  });

  it("doesn't promote when a transfer agrees", () => {
    userState.mergeFromSave({ mineFloor: 10 }, { source: "unknown" });
    userState.mergeFromSave({ mineFloor: 10 }, { source: "unknown" });

    expect(userState.provenanceOf("mineFloor")).toEqual({ source: "unknown" });
  });

  it("leaves a manual fact manual when a save agrees with it", () => {
    userState.toggleAlmanacItem(TURNIP);
    userState.mergeFromSave({ almanac: new Set([TURNIP]) }, { playtime: 5 });

    expect(userState.provenanceOf("almanac/turnip")).toEqual({ source: "manual" });
  });

  it("records default unlocks & everything recordInferred changes as inferred", () => {
    userState.markDefaultUnlocksComplete();
    const [defaultRecipe] = userState.state.progress.almanacRecipes;
    expect(defaultRecipe).toBeDefined();
    expect(userState.provenanceOf(`almanacRecipes/${defaultRecipe}`)?.source).toBe("inferred");

    userState.recordInferred(() => {
      userState.setMineFloor(12);
      userState.togglePerk("museum_quality_one" as PerkId);
    });

    expect(userState.provenanceOf("mineFloor")?.source).toBe("inferred");
    expect(userState.provenanceOf("unlockedPerks/museum_quality_one")?.source).toBe("inferred");
  });

  it("records nothing for an edit that changes nothing", () => {
    userState.setReachedSeason("spring");
    userState.setRenown(0);

    expect(userState.provenanceOf("reachedSeason")).toBeUndefined();
    expect(userState.provenanceOf("renown")).toBeUndefined();
  });
});

describe("resolutions", () => {
  it("holds “keep mine” until a manual edit of that fact clears it", () => {
    userState.keepMine("heartLevels/balor", 6);

    userState.setHeartLevel("celine" as VillagerId, 2);
    expect(resolutionHolds(userState.resolutionOf("heartLevels/balor"), 6)).toBe(true);
    expect(resolutionHolds(userState.resolutionOf("heartLevels/balor"), 7)).toBe(false);

    userState.setHeartLevel("balor" as VillagerId, 3);
    expect(userState.resolutionOf("heartLevels/balor")).toBeUndefined();
  });

  it("isn't cleared by an inferred or save change to the fact", () => {
    userState.keepMine("renown", 9);

    userState.recordInferred(() => {
      userState.setRenown(4);
    });
    userState.mergeFromSave({ renown: 5 }, { playtime: 10 });

    expect(userState.resolutionOf("renown")).toEqual({ saveValue: 9 });
  });
});

describe("history in backups", () => {
  it("round-trips provenance, unticks, resolutions, & the last save's playtime", () => {
    userState.mergeFromSave({ mineFloor: 10 }, { playtime: 7200.5 });
    userState.toggleAlmanacItem(TURNIP);
    userState.toggleAlmanacItem(TURNIP);
    userState.keepMine("mineFloor", 12);
    const json = userState.exportBackup();
    expect(JSON.parse(json)).toMatchObject({
      progress: {
        lastSavePlaytime: 7200.5,
        provenance: {
          "almanac/turnip": { playtime: 7200.5, source: "manual" },
          mineFloor: { playtime: 7200.5, source: "save" },
        },
        resolutions: { mineFloor: { saveValue: 12 } },
      },
    });

    userState.resetAll();
    expect(userState.restoreBackup(json)).toEqual({ ok: true });

    expect(userState.exportBackup()).toBe(json);
    expect(userState.provenanceOf("almanac/turnip")).toEqual({
      playtime: 7200.5,
      source: "manual",
    });
    expect(userState.resolutionOf("mineFloor")).toEqual({ saveValue: 12 });
    expect(userState.lastSavePlaytime).toBe(7200.5);
  });

  it("replaces history on restore", () => {
    userState.setRenown(2);
    const backup = userState.exportBackup();
    userState.resetAll();
    userState.mergeFromSave({ mineFloor: 10 }, { playtime: 50 });
    userState.keepMine("mineFloor", 12);

    expect(userState.restoreBackup(backup)).toEqual({ ok: true });

    expect(userState.provenanceOf("renown")).toEqual({ source: "manual" });
    expect(userState.provenanceOf("mineFloor")).toBeUndefined();
    expect(userState.resolutionOf("mineFloor")).toBeUndefined();
    expect(userState.lastSavePlaytime).toBeUndefined();
  });

  it.each(["resetAll", "resetProgress"] as const)("is cleared by %s", (reset) => {
    userState.mergeFromSave({ mineFloor: 10 }, { playtime: 50 });
    userState.keepMine("mineFloor", 12);

    userState[reset]();

    expect(userState.provenanceOf("mineFloor")).toBeUndefined();
    expect(userState.resolutionOf("mineFloor")).toBeUndefined();
    expect(userState.lastSavePlaytime).toBeUndefined();
    expect(JSON.parse(userState.exportBackup())).toMatchObject({
      progress: { provenance: {}, resolutions: {} },
    });
  });
});
