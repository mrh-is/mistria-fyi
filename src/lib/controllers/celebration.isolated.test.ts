import { beforeEach, expect, it, vi } from "vitest";

import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
import { getMaxRenownLevel } from "#lib/engine/progress.js";
import { userState } from "#lib/stores/user-state.svelte.js";

import { celebrateProgress } from "./celebration.js";

vi.mock("#lib/effects/celebrate.js", () => ({ celebrate: vi.fn(), celebrateCategory: vi.fn() }));

beforeEach(() => {
  userState.resetAll();
  vi.mocked(celebrate).mockClear();
  vi.mocked(celebrateCategory).mockClear();
});

it("celebrates a category the action finishes, & nothing smaller with it", () => {
  let sectionDone = false;
  celebrateProgress(
    "renown",
    () => {
      userState.setRenown(getMaxRenownLevel());
      sectionDone = true;
    },
    [() => sectionDone],
  );

  expect(celebrateCategory).toHaveBeenCalledTimes(1);
  expect(celebrate).not.toHaveBeenCalled();
});

it("celebrates a section the action finishes when the category stays open", () => {
  let sectionDone = false;
  celebrateProgress(
    "renown",
    () => {
      sectionDone = true;
    },
    [() => false, () => sectionDone],
  );

  expect(celebrate).toHaveBeenCalledTimes(1);
  expect(celebrateCategory).not.toHaveBeenCalled();
});

it("doesn't celebrate what was already finished before the action", () => {
  userState.setRenown(getMaxRenownLevel());
  celebrateProgress(
    "renown",
    () => {
      userState.setRenown(getMaxRenownLevel());
    },
    [() => true],
  );

  expect(celebrate).not.toHaveBeenCalled();
  expect(celebrateCategory).not.toHaveBeenCalled();
});

it("doesn't celebrate an action that undoes progress", () => {
  userState.setRenown(getMaxRenownLevel());
  let sectionDone = true;
  celebrateProgress(
    "renown",
    () => {
      userState.setRenown(0);
      sectionDone = false;
    },
    [() => sectionDone],
  );

  expect(celebrate).not.toHaveBeenCalled();
  expect(celebrateCategory).not.toHaveBeenCalled();
});

it("returns the action’s result", () => {
  expect(celebrateProgress("renown", () => 42)).toBe(42);
});
