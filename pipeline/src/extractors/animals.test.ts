import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle as makeFiddleBase, stubLocalizer } from "../test-helpers.js";
import { extractAnimals as extractLocalizedAnimals } from "./animals.js";

function extractAnimals(fiddle: ReturnType<typeof makeFiddleBase>) {
  const { animals, localeNames } = extractLocalizedAnimals(fiddle, stubLocalizer());
  return Object.fromEntries(
    Object.entries(animals).map(([animalId, animal]) => [
      animalId,
      {
        ...animal,
        cosmetics: Object.fromEntries(
          Object.entries(animal.cosmetics).map(([cosmeticId, cosmetic]) => [
            cosmeticId,
            { ...cosmetic, name: localeNames.en[`${animalId}/cosmetics/${cosmeticId}`] },
          ]),
        ),
        name: localeNames.en[`${animalId}/core`],
        variantTiers: animal.variantTiers.map((tier) =>
          Object.fromEntries(
            Object.entries(tier).map(([variantId, variant]) => [
              variantId,
              { ...variant, name: localeNames.en[`${animalId}/variants/${variantId}`] },
            ]),
          ),
        ),
      },
    ]),
  );
}

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({ ranching: { animals: {} }, ...overrides });
}

describe("extractAnimals", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
  });

  it("returns empty record when ranching data is absent", () => {
    const fiddle = makeFiddle();
    expect(extractAnimals(fiddle)).toEqual({});
  });

  it("extracts a basic animal with variants and cosmetics", () => {
    const fiddle = makeFiddle({
      ranching: {
        animals: {
          chicken: {
            core: { name: "Chicken" },
            cosmetics: {
              chicken_hat: { name: "Chicken Hat" },
            },
            variants: {
              brown: { name: "Brown", tier: 2 },
              white: { default_unlocked: true, name: "White", tier: 1 },
            },
          },
        },
      },
    });

    expect(extractAnimals(fiddle)).toEqual({
      chicken: {
        cosmetics: {
          chicken_hat: { name: "Hat", sources: [] },
        },
        name: "Chicken",
        variantTiers: [
          { white: { name: "White", source: { type: "default" } } },
          { brown: { name: "Brown", source: { type: "breed" } } },
        ],
      },
    });
  });

  it.each([
    ["core", { core: {}, variants: {} }, "ranching.animals.chicken.core.name"],
    [
      "variant",
      { core: { name: "Chicken" }, variants: { white: { tier: 1 } } },
      "ranching.animals.chicken.variants.white.name",
    ],
    [
      "cosmetic",
      { core: { name: "Chicken" }, cosmetics: { hat: {} }, variants: {} },
      "ranching.animals.chicken.cosmetics.hat.name",
    ],
  ])("rejects an animal %s without a source name", (_kind, chicken, field) => {
    const fiddle = makeFiddle({ ranching: { animals: { chicken } } });

    expect(() => extractAnimals(fiddle)).toThrow(
      `Expected nonempty string for ${field} in ranching.toml`,
    );
  });

  it("places default_unlocked variants into tier 1 regardless of their tier field", () => {
    const fiddle = makeFiddle({
      ranching: {
        animals: {
          cow: {
            core: { name: "Cow" },
            variants: {
              highland: { name: "Highland", tier: 2 },
              spotted: { default_unlocked: true, name: "Spotted", tier: 3 },
            },
          },
        },
      },
    });

    const result = extractAnimals(fiddle);
    expect(result).toEqual({
      cow: {
        cosmetics: {},
        name: "Cow",
        variantTiers: [
          { spotted: { name: "Spotted", source: { type: "default" } } },
          { highland: { name: "Highland", source: { type: "breed" } } },
        ],
      },
    });
  });

  it("groups variants by tier and sorts tiers numerically", () => {
    const fiddle = makeFiddle({
      ranching: {
        animals: {
          sheep: {
            core: { name: "Sheep" },
            variants: {
              curly: { name: "Curly", tier: 1 },
              fluffy: { name: "Fluffy", tier: 3 },
              woolly: { name: "Woolly", tier: 2 },
            },
          },
        },
      },
    });

    const result = extractAnimals(fiddle);
    expect(result).toEqual({
      sheep: {
        cosmetics: {},
        name: "Sheep",
        variantTiers: [
          { curly: { name: "Curly", source: { type: "breed" } } },
          { woolly: { name: "Woolly", source: { type: "breed" } } },
          { fluffy: { name: "Fluffy", source: { type: "breed" } } },
        ],
      },
    });
  });

  it("skips default and non-acquirable variants", () => {
    const fiddle = makeFiddle({
      ranching: {
        animals: {
          duck: {
            core: { name: "Duck" },
            variants: {
              default: { name: "Template", tier: 1 },
              hidden: { acquirable: false, name: "Hidden", tier: 1 },
              mallard: { name: "Mallard", tier: 1 },
            },
          },
        },
      },
    });

    expect(extractAnimals(fiddle)).toEqual({
      duck: {
        cosmetics: {},
        name: "Duck",
        variantTiers: [{ mallard: { name: "Mallard", source: { type: "breed" } } }],
      },
    });
  });

  it("strips species name from cosmetic names", () => {
    const fiddle = makeFiddle({
      ranching: {
        animals: {
          chicken: {
            core: { name: "Chicken" },
            cosmetics: {
              chicken_hat: { name: "Chicken Hat" },
              scarf: { name: "Cozy Scarf" },
            },
            variants: {},
          },
        },
      },
    });

    expect(extractAnimals(fiddle)).toEqual({
      chicken: {
        cosmetics: {
          chicken_hat: { name: "Hat", sources: [] },
          scarf: { name: "Cozy Scarf", sources: [] },
        },
        name: "Chicken",
        variantTiers: [],
      },
    });
  });

  it("skips default cosmetic entries", () => {
    const fiddle = makeFiddle({
      ranching: {
        animals: {
          goat: {
            core: { name: "Goat" },
            cosmetics: {
              bell: { name: "Bell" },
              default: { name: "Default Cosmetic" },
            },
            variants: {},
          },
        },
      },
    });

    expect(extractAnimals(fiddle)).toEqual({
      goat: {
        cosmetics: {
          bell: { name: "Bell", sources: [] },
        },
        name: "Goat",
        variantTiers: [],
      },
    });
  });

  it("assigns breed source to non-default-unlocked variants", () => {
    const fiddle = makeFiddle({
      ranching: {
        animals: {
          cow: {
            core: { name: "Cow" },
            variants: {
              rare_cow: { name: "Rare Cow", tier: 2 },
            },
          },
        },
      },
    });

    expect(extractAnimals(fiddle)).toEqual({
      cow: {
        cosmetics: {},
        name: "Cow",
        variantTiers: [{ rare_cow: { name: "Rare Cow", source: { type: "breed" } } }],
      },
    });
  });

  it("defaults variant tier to 1 when not specified", () => {
    const fiddle = makeFiddle({
      ranching: {
        animals: {
          pig: {
            core: { name: "Pig" },
            variants: {
              pink: { name: "Pink" },
            },
          },
        },
      },
    });

    expect(extractAnimals(fiddle)).toEqual({
      pig: {
        cosmetics: {},
        name: "Pig",
        variantTiers: [{ pink: { name: "Pink", source: { type: "breed" } } }],
      },
    });
  });

  it("rejects a missing animal core instead of using its ID as a name", () => {
    const fiddle = makeFiddle({
      ranching: {
        animals: {
          mystery_beast: {
            variants: {
              normal: { name: "Normal", tier: 1 },
            },
          },
        },
      },
    });

    expect(() => extractAnimals(fiddle)).toThrow(
      "Expected nonempty string for ranching.animals.mystery_beast.core.name in ranching.toml",
    );
  });

  it("handles animals with no variants or cosmetics", () => {
    const fiddle = makeFiddle({
      ranching: {
        animals: {
          lonely: {
            core: { name: "Lonely Animal" },
          },
        },
      },
    });

    expect(extractAnimals(fiddle)).toEqual({
      lonely: {
        cosmetics: {},
        name: "Lonely Animal",
        variantTiers: [],
      },
    });
  });
});
