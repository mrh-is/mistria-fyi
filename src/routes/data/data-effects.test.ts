import { describe, expect, it } from "vitest";

import { openThenScroll } from "./data-effects.js";

describe("data effects", () => {
  it("waits for the opened content to settle before scrolling", async () => {
    const { promise: settled, resolve: release } = Promise.withResolvers<undefined>();
    const events: string[] = [];

    const completed = openThenScroll(
      () => events.push("open"),
      () => events.push("scroll"),
      () => settled,
    );

    expect(events).toEqual(["open"]);

    release(undefined);
    await completed;

    expect(events).toEqual(["open", "scroll"]);
  });
});
