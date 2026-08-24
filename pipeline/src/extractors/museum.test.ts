import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle as makeFiddleBase } from "../test-helpers.js";
import { extractMuseum } from "./museum.js";

vi.mock("../parse-fiddle.js", () => ({
  sourceFileFor: () => "mock-source.toml",
}));

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({ museum_wings: {}, ui: {}, ...overrides });
}

describe("extractMuseum", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("returns empty record when museum_wings is absent", () => {
    const fiddle = makeFiddleBase({ ui: {} });
    expect(extractMuseum(fiddle)).toEqual({});
  });

  it("extracts wings and sets as records", () => {
    const fiddle = makeFiddle({
      museum_wings: {
        archaeology: {
          name: "Archaeology",
          sets: {
            aldarian: {
              items: ["sword", "shield"],
              name: "Aldarian",
            },
          },
        },
      },
    });

    expect(extractMuseum(fiddle)).toEqual({
      archaeology: {
        name: "Archaeology",
        sets: {
          aldarian: {
            items: ["sword", "shield"],
            name: "Aldarian",
          },
        },
      },
    });
  });

  it("uses wing ID as name fallback", () => {
    const fiddle = makeFiddle({
      museum_wings: {
        gems: {
          sets: {
            rubies: { items: ["ruby"], name: "Rubies" },
          },
        },
      },
    });

    expect(extractMuseum(fiddle)).toEqual({
      gems: {
        name: "gems",
        sets: {
          rubies: { items: ["ruby"], name: "Rubies" },
        },
      },
    });
  });

  it("uses set ID as set name fallback", () => {
    const fiddle = makeFiddle({
      museum_wings: {
        archaeology: {
          name: "Archaeology",
          sets: {
            fossils: { items: ["bone"] },
          },
        },
      },
    });

    expect(extractMuseum(fiddle)).toEqual({
      archaeology: {
        name: "Archaeology",
        sets: {
          fossils: { items: ["bone"], name: "fossils" },
        },
      },
    });
  });

  it("respects wing ordering from UI menus", () => {
    const fiddle = makeFiddle({
      museum_wings: {
        alpha: {
          name: "Alpha",
          sets: { s1: { items: ["a"], name: "S1" } },
        },
        beta: {
          name: "Beta",
          sets: { s2: { items: ["b"], name: "S2" } },
        },
        gamma: {
          name: "Gamma",
          sets: { s3: { items: ["c"], name: "S3" } },
        },
      },
      ui: {
        menus: {
          standard_menus: {
            museum: {
              beta_order: ["s2"],
              gamma_order: ["s3"],
              wings: [{ wing: "gamma" }, { wing: "beta" }],
            },
          },
        },
      },
    });

    expect(Object.keys(extractMuseum(fiddle))).toEqual(["gamma", "beta"]);
  });

  it("skips wings referenced in UI order but missing from data", () => {
    const fiddle = makeFiddle({
      museum_wings: {
        alpha: {
          name: "Alpha",
          sets: { s1: { items: ["a"], name: "S1" } },
        },
      },
      ui: {
        menus: {
          standard_menus: {
            museum: {
              alpha_order: ["s1"],
              missing_order: [],
              wings: [{ wing: "missing" }, { wing: "alpha" }],
            },
          },
        },
      },
    });

    expect(Object.keys(extractMuseum(fiddle))).toEqual(["alpha"]);
  });

  it("respects set ordering from UI menus", () => {
    const fiddle = makeFiddle({
      museum_wings: {
        archaeology: {
          name: "Archaeology",
          sets: {
            aldarian: { items: ["a"], name: "Aldarian" },
            fossils: { items: ["b"], name: "Fossils" },
            relics: { items: ["c"], name: "Relics" },
          },
        },
      },
      ui: {
        menus: {
          standard_menus: {
            museum: {
              archaeology_order: ["relics", "aldarian", "fossils"],
              wings: [{ wing: "archaeology" }],
            },
          },
        },
      },
    });

    const result = extractMuseum(fiddle);
    const sets = result[Object.keys(result)[0] as keyof typeof result];
    expect(Object.keys((sets as { sets: Record<string, unknown> }).sets)).toEqual([
      "relics",
      "aldarian",
      "fossils",
    ]);
  });

  it("skips wings with no sets", () => {
    const fiddle = makeFiddle({
      museum_wings: {
        empty_wing: {
          name: "Empty",
        },
      },
    });

    expect(extractMuseum(fiddle)).toEqual({});
  });

  it("handles multiple wings with multiple sets", () => {
    const fiddle = makeFiddle({
      museum_wings: {
        archaeology: {
          name: "Archaeology",
          sets: {
            aldarian: { items: ["sword"], name: "Aldarian" },
            fossils: { items: ["bone", "shell"], name: "Fossils" },
          },
        },
        natural: {
          name: "Natural History",
          sets: {
            fish: { items: ["trout"], name: "Fish" },
          },
        },
      },
    });

    expect(extractMuseum(fiddle)).toEqual({
      archaeology: {
        name: "Archaeology",
        sets: {
          aldarian: { items: ["sword"], name: "Aldarian" },
          fossils: { items: ["bone", "shell"], name: "Fossils" },
        },
      },
      natural: {
        name: "Natural History",
        sets: {
          fish: { items: ["trout"], name: "Fish" },
        },
      },
    });
  });
});
