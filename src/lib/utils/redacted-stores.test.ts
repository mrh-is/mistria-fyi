import { afterEach, describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { isVisible } from "#lib/engine/visibility.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { recordEntries } from "#lib/utils/record.js";

import { computeRedactedStoreIds } from "./redacted-stores.js";

describe("computeRedactedStoreIds", () => {
  afterEach(() => {
    userState.resetAll();
  });

  it("redacts exactly the stores with an unmet visibility condition", () => {
    userState.resetAll();
    const state = userState.progressionState;
    const redacted = computeRedactedStoreIds(state);
    const expected = recordEntries(trackerData.stores)
      .filter(([, { visibility }]) => visibility && !isVisible(visibility, state))
      .map(([id]) => id);

    expect(expected.length).toBeGreaterThan(0);
    expect([...redacted].toSorted()).toEqual(expected.toSorted());
    const ungated = recordEntries(trackerData.stores)
      .filter(([, store]) => !store.visibility)
      .map(([id]) => id);
    expect(ungated.filter((id) => redacted.has(id))).toEqual([]);
  });
});
