import { afterEach, describe, expect, it } from "vitest";

import {
  PREFERENCES_STORAGE_KEY,
  PROGRESS_STORAGE_KEY,
  QUARANTINE_STORAGE_KEY,
} from "#lib/stores/storage-keys.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { THEME_STORAGE_KEY } from "#lib/theme.js";

// The launch shape of the progress blob & JSON backup. Unlike round-trip tests, this literal pins
// the stored contract independently of the serializer: renaming a field, the wrapper, or the
// version fails here instead of quarantining every player's saved progress. Change it only together
// with a versioned migration (see docs/app-architecture.md §3).
const GOLDEN_BACKUP = {
  progress: {
    almanac: ["turnip"],
    almanacRecipes: ["basic_wood_chest"],
    animalCosmetics: { chicken: ["ribbon_red"] },
    animals: { chicken: ["red"] },
    childChoice: "no",
    cosmetics: ["back_gear_ancient_witch_broom"],
    dates: ["inn_meal"],
    hasUpperFloor: true,
    heartLevels: { balor: 4 },
    mineFloor: 20,
    museum: ["turnip"],
    petCosmetics: ["flower_crown"],
    petSkins: ["sapling"],
    questStates: { repair_the_general_store: "completed" },
    reachedSeason: "fall",
    renown: 17,
    skillLevels: { farming: 7 },
    spells: ["summon_rain"],
    unlockedPerks: ["museum_quality_one"],
    villagerRelationships: { balor: "romantic" },
  },
  version: 1,
  worldState: { season: "summer", weather: "inclement" },
};

/** Optional fields added after launch, as an empty launch-era blob writes them back. */
const POST_LAUNCH_FIELDS = { mountAppearances: [] };

afterEach(() => {
  userState.resetAll();
});

describe("persisted format contract", () => {
  it("keeps the storage keys players' data lives under", () => {
    expect(PROGRESS_STORAGE_KEY).toBe("mistria-fyi:progress");
    expect(QUARANTINE_STORAGE_KEY).toBe("mistria-fyi:progress-quarantine");
    expect(PREFERENCES_STORAGE_KEY).toBe("mistria-fyi:preferences");
    expect(THEME_STORAGE_KEY).toBe("mistria-fyi:theme");
  });

  it("restores the launch backup and writes it back unchanged", () => {
    expect(userState.restoreBackup(JSON.stringify(GOLDEN_BACKUP))).toEqual({ ok: true });

    // Every animal gets an entry on load; animals added by later game data appear as empty lists.
    // Fields added after launch are optional on read and written empty.
    const { animalCosmetics, animals, ...progress } = GOLDEN_BACKUP.progress;
    expect(JSON.parse(userState.exportBackup())).toEqual({
      ...GOLDEN_BACKUP,
      lastImport: null,
      progress: {
        ...progress,
        ...POST_LAUNCH_FIELDS,
        animalCosmetics: expect.objectContaining(animalCosmetics) as unknown,
        animals: expect.objectContaining(animals) as unknown,
      },
      version: 2,
    });
  });

  it("round-trips the fields added after launch", () => {
    const backup = {
      ...GOLDEN_BACKUP,
      progress: { ...GOLDEN_BACKUP.progress, mountAppearances: ["mistmare"] },
    };
    expect(userState.restoreBackup(JSON.stringify(backup))).toEqual({ ok: true });

    expect(userState.state.progress.mountAppearances).toEqual(new Set(["mistmare"]));
    expect(JSON.parse(userState.exportBackup())).toMatchObject({
      progress: { mountAppearances: ["mistmare"] },
    });
  });
});
