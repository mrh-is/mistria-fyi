import { afterEach, describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { isConditionVisible } from "#lib/engine/visibility.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { recordEntries } from "#lib/utils/record.js";

import { computeSpoileredStoreIds } from "./spoilered-stores.js";

describe("computeSpoileredStoreIds", () => {
  afterEach(() => {
    userState.resetAll();
  });

  it("spoilers exactly the stores with an unmet visibility condition", () => {
    userState.resetAll();
    const state = userState.progressionState;
    const spoilered = computeSpoileredStoreIds(state);
    const expected = recordEntries(trackerData.stores)
      .filter(([, { visibility }]) => visibility && !isConditionVisible(visibility, state))
      .map(([id]) => id);

    expect(expected.length).toBeGreaterThan(0);
    expect([...spoilered].toSorted()).toEqual(expected.toSorted());
    const ungated = recordEntries(trackerData.stores)
      .filter(([, store]) => !store.visibility)
      .map(([id]) => id);
    expect(ungated.filter((id) => spoilered.has(id))).toEqual([]);
  });
});
