import { afterEach, describe, expect, it, vi } from "vitest";

import { celebrate, celebrateCategory } from "#lib/utils/celebrate.js";

const confetti = vi.hoisted(() => vi.fn());

vi.mock("canvas-confetti", () => ({ default: confetti }));

describe("confetti colors", () => {
  afterEach(() => {
    confetti.mockClear();
    document.documentElement.removeAttribute("style");
  });

  it("reads the burst palette from the --color-confetti-* tokens", () => {
    for (let n = 1; n <= 7; n += 1) {
      document.documentElement.style.setProperty(
        `--color-confetti-${n.toString()}`,
        `#00000${n.toString()}`,
      );
    }

    celebrate();
    celebrateCategory();

    const [burst, ...category] = confetti.mock.calls.map(
      ([options]) => options as { colors: string[] },
    );
    expect(burst.colors).toEqual(["#000001", "#000002", "#000003", "#000004", "#000005"]);
    expect(category[0].colors).toEqual([
      "#000001",
      "#000002",
      "#000003",
      "#000004",
      "#000006",
      "#000007",
    ]);
  });
});
