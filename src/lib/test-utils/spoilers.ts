import { expect } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";

/**
 * Turns spoilers on whatever their current value. Client files share one store per worker, so a
 * test that toggles assumes a starting value an earlier file may not have left (#174).
 */
export function enableSpoilers(): void {
  if (!userState.state.showSpoilers) userState.toggleShowSpoilers();
  expect(userState.state.showSpoilers).toBe(true);
}
