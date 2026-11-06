import { describe, expect, it, vi } from "vitest";

import { UpdateHolds } from "./update-holds.js";

describe("UpdateHolds", () => {
  it("stays held until every task releases, and notifies once per release", () => {
    const holds = new UpdateHolds();
    const listener = vi.fn();
    holds.onRelease(listener);
    const first = holds.hold();
    const second = holds.hold();
    first();
    first();
    expect(holds.held).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    second();
    expect(holds.held).toBe(false);
  });

  it("ignores a release from before a reset", () => {
    const holds = new UpdateHolds();
    const listener = vi.fn();
    holds.onRelease(listener);
    const stale = holds.hold();
    holds.reset();
    expect(holds.held).toBe(false);
    holds.hold();
    stale();
    expect(holds.held).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });
});
