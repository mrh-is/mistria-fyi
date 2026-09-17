import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import RankRecordHarness from "./rank-record.test-harness.svelte";

describe("RankRecord", () => {
  it.each([
    {
      currentLevel: 10,
      expected: "completed",
      rank: { levels: { start: 0, end: 9 }, name: "Wood" },
    },
    {
      currentLevel: 14,
      expected: "current",
      name: "Stone",
      rank: { levels: { start: 10, end: 19 } },
    },
    {
      currentLevel: 10,
      expected: "upcoming",
      rank: { levels: { start: 20, end: 29 }, name: "Copper" },
    },
  ])("renders the $expected state without relying on color", ({ currentLevel, expected, rank }) => {
    const view = render(RankRecordHarness, { currentLevel, rank });
    expect(view.container.querySelector("[data-rank-record]")).toHaveAttribute(
      "data-rank-state",
      expected,
    );
    expect(view.getByText(new RegExp(expected, "i"))).toBeInTheDocument();
  });

  it("shows a partially filled current mark from the inclusive range", () => {
    const view = render(RankRecordHarness, {
      currentLevel: 14,
      name: "Stone",
      rank: { levels: { start: 10, end: 19 } },
    });
    expect(view.getByTestId("rank-fill")).toHaveStyle("clip-path: inset(0 60% 0 0)");
    expect(view.getByText("4 / 10")).toBeInTheDocument();
  });

  it("reveals a spoilered upcoming rank explicitly", async () => {
    const view = render(RankRecordHarness, {
      currentLevel: 0,
      name: "Secret rank",
      rank: { levels: { start: 10, end: 19 } },
      spoilered: true,
    });
    expect(view.getByRole("button", { name: "Reveal spoiler" })).toBeInTheDocument();
    expect(view.queryByRole("listitem", { name: /Secret rank/ })).not.toBeInTheDocument();
    await fireEvent.click(view.getByRole("button", { name: "Reveal spoiler" }));
    expect(view.getByText("Secret rank")).toBeVisible();
  });
});
