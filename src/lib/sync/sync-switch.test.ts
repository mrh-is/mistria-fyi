import { describe, expect, it } from "vitest";

import { syncSwitchOn } from "./sync-switch.js";

describe("syncSwitchOn", () => {
  it("is on outside a production deployment", () => {
    expect(syncSwitchOn).toBe(true);
  });
});
