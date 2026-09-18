import { describe, expect, it, vi } from "vitest";

import { closeScanner, openThenScroll } from "./data-effects";

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

  it("stops and destroys an active scanner", () => {
    const scanner = {
      destroy: vi.fn(),
      stop: vi.fn(),
    };

    const cleared = closeScanner(scanner);

    expect(scanner.stop).toHaveBeenCalledOnce();
    expect(scanner.destroy).toHaveBeenCalledOnce();
    expect(cleared).toBeNull();
  });

  it("accepts an already cleared scanner", () => {
    expect(closeScanner(null)).toBeNull();
  });
});
