import { expect } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";

/** Turns spoilers on without changing them if they are already enabled. */
export function enableSpoilers(): void {
  if (!userState.state.showSpoilers) userState.toggleShowSpoilers();
  expect(userState.state.showSpoilers).toBe(true);
}
