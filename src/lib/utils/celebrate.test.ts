import { describe, expect, it, vi } from "vitest";

import { celebrate, celebrateCategory } from "#lib/utils/celebrate.js";

const confetti = vi.hoisted(() => vi.fn());

vi.mock("canvas-confetti", () => ({ default: confetti }));

describe("celebrations", () => {
  it("delegates reduced-motion handling to canvas-confetti", () => {
    celebrate();
    celebrateCategory();

    expect(confetti.mock.calls.length).toBeGreaterThan(0);
    for (const call of confetti.mock.calls) {
      expect(call[0]).toMatchObject({ disableForReducedMotion: true });
    }
  });
});
