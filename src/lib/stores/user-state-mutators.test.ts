import { afterEach, describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { recordKeys } from "#lib/utils/record.js";

import type { AnimalId, AnimalVariantId } from "#lib/types/tracker-data.js";

const [animalId, animal] = Object.entries(trackerData.animals).find(
  ([, candidate]) =>
    candidate.variantTiers.some((tier) => Object.keys(tier).length > 0) &&
    Object.keys(candidate.cosmetics).length > 0,
) as [AnimalId, (typeof trackerData.animals)[AnimalId]];
const variantId = Object.keys(
  animal.variantTiers.find((tier) => Object.keys(tier).length > 0) ?? {},
)[0] as AnimalVariantId;
const animalCosmeticId = recordKeys(animal.cosmetics)[0];
const cosmeticId = recordKeys(trackerData.cosmetics)[0];
const dateId = recordKeys(trackerData.dates)[0];
const petCosmeticId = recordKeys(trackerData.pets.cosmetics)[0];
const petSkinId = recordKeys(trackerData.pets.skins)[0];

/** A tracked collection: how to toggle one entry, & how to read the collection back. */
const COLLECTIONS = [
  {
    name: "cosmetics",
    read: () => [...userState.state.progress.cosmetics],
    toggle: () => {
      userState.toggleCosmetic(cosmeticId);
    },
    value: cosmeticId,
  },
  {
    name: "dates",
    read: () => [...userState.state.progress.dates],
    toggle: () => {
      userState.toggleDate(dateId);
    },
    value: dateId,
  },
  {
    name: "animal variants",
    read: () => [...(userState.state.progress.animals[animalId] ?? [])],
    toggle: () => {
      userState.toggleAnimalVariant(animalId, variantId);
    },
    value: variantId,
  },
  {
    name: "animal cosmetics",
    read: () => [...(userState.state.progress.animalCosmetics[animalId] ?? [])],
    toggle: () => {
      userState.toggleAnimalCosmetic(animalId, animalCosmeticId);
    },
    value: animalCosmeticId,
  },
  {
    name: "pet cosmetics",
    read: () => [...userState.state.progress.petCosmetics],
    toggle: () => {
      userState.togglePetCosmetic(petCosmeticId);
    },
    value: petCosmeticId,
  },
  {
    name: "pet skins",
    read: () => [...userState.state.progress.petSkins],
    toggle: () => {
      userState.togglePetSkin(petSkinId);
    },
    value: petSkinId,
  },
];

describe("collection toggles", () => {
  afterEach(() => {
    userState.resetAll();
  });

  it.each(COLLECTIONS)("toggles $name on, off, & on again", ({ read, toggle, value }) => {
    expect(read()).toEqual([]);

    toggle();
    expect(read()).toEqual([value]);

    toggle();
    expect(read()).toEqual([]);

    toggle();
    expect(read()).toEqual([value]);
  });

  it.each(COLLECTIONS)("round-trips $name through exportBackup & restoreBackup", (collection) => {
    collection.toggle();
    const json = userState.exportBackup();

    userState.resetAll();
    expect(collection.read()).toEqual([]);
    expect(userState.restoreBackup(json)).toEqual({ ok: true });

    expect(collection.read()).toEqual([collection.value]);
  });

  it("reports progress after a lazily created animal set gains its first entry", () => {
    expect(userState.hasAnyProgress).toBe(false);

    userState.toggleAnimalVariant(animalId, variantId);

    expect(userState.hasAnyProgress).toBe(true);
  });
});

describe("world state & availability", () => {
  afterEach(() => {
    userState.resetAll();
  });

  it("round-trips season & weather through exportBackup & restoreBackup", () => {
    userState.setSeason("winter");
    userState.setWeather("heavy_inclement");
    const json = userState.exportBackup();

    userState.resetAll();
    expect(userState.restoreBackup(json)).toEqual({ ok: true });

    expect(userState.state.worldState).toEqual({ season: "winter", weather: "heavy_inclement" });
  });

  it("leaves weather untouched when it's rejected for the season", () => {
    userState.setSeason("summer");
    userState.setWeather("inclement");

    userState.setWeather("special");

    expect(userState.state.worldState.weather).toBe("inclement");
  });

  it("stores availability windows in canonical order without duplicates", () => {
    userState.setAvailabilityWindows(["later", "now", "later"]);

    expect(userState.state.availabilityWindows).toEqual(["now", "later"]);
  });
});
