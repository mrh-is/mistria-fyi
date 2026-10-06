import { expectTypeOf, it } from "vitest";

import { userState } from "./user-state.svelte.js";

import type { ItemId } from "#lib/types/tracker-data.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

it("exposes readonly nested state while preserving branded IDs", () => {
  expectTypeOf(userState.state.completed.almanac).toEqualTypeOf<ReadonlySet<ItemId>>();
  expectTypeOf(userState.state.completed.almanac).not.toHaveProperty("add");
  expectTypeOf(userState.state.completed.almanac).not.toHaveProperty("clear");
  expectTypeOf(userState.state.completed.almanac).not.toHaveProperty("delete");
  expectTypeOf<DeepReadonly<ItemId>>().toEqualTypeOf<ItemId>();
  expectTypeOf(userState.state.availabilityWindows).toEqualTypeOf<
    readonly (typeof userState.state.availabilityWindows)[number][]
  >();
});
