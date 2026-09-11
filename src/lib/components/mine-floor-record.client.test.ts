import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import MineFloorRecordHarness from "$lib/components/mine-floor-record.test-harness.svelte";

import type { MinesBiome, MinesBiomeId } from "$lib/types/tracker-data.js";

const biomes: MinesBiome[] = [
  { floors: { start: 1, end: 20 }, id: "upper" as MinesBiomeId, name: "Upper Mines" },
  { floors: { start: 21, end: 40 }, id: "tide" as MinesBiomeId, name: "Tide Caverns" },
  { floors: { start: 41, end: 60 }, id: "deep" as MinesBiomeId, name: "Deep Earth" },
];

describe("MineFloorRecord", () => {
  it("derives inclusive biome proportions and the marker from supplied ranges", () => {
    const view = render(MineFloorRecordHarness, { biomes, initialFloor: 0 });
    const segments = view.container.querySelectorAll("[data-mine-biome-segment]");

    expect(segments).toHaveLength(3);
    for (const segment of segments) expect(segment).toHaveStyle("width: 33.33333333333333%");
    expect(view.getByTestId("mine-survey")).toHaveAttribute("aria-hidden", "true");
    expect(view.getByTestId("mine-marker")).toHaveStyle("left: 0%");
    expect(view.getByText("Upper Mines")).toBeInTheDocument();
    expect(view.queryByRole("slider")).not.toBeInTheDocument();
  });

  it.each([
    { biome: "Upper Mines", floor: 20 },
    { biome: "Tide Caverns", floor: 21 },
    { biome: "Deep Earth", floor: 60 },
  ])("names $biome at floor $floor", ({ biome, floor }) => {
    const view = render(MineFloorRecordHarness, { biomes, initialFloor: floor });
    expect(view.getByText(biome)).toBeInTheDocument();
    expect(view.getByRole("group", { name: `Mine floor, ${floor} of 60` })).toBeInTheDocument();
  });

  it("clamps direct edits and ignores empty or invalid values", async () => {
    const view = render(MineFloorRecordHarness, { biomes, initialFloor: 10 });
    const input = view.getByRole("spinbutton", { name: "Mine floor" });

    await fireEvent.input(input, { target: { value: "100" } });
    await fireEvent.change(input);
    expect(input).toHaveValue(60);
    expect(view.getByRole("button", { name: "Go down one floor" })).toBeDisabled();

    await fireEvent.input(input, { target: { value: "" } });
    await fireEvent.change(input);
    expect(input).toHaveValue(60);
  });

  it("uses adjacent bounded controls and supports a compact record", async () => {
    const view = render(MineFloorRecordHarness, { biomes, compact: true, initialFloor: 0 });
    const up = view.getByRole("button", { name: "Go up one floor" });
    const down = view.getByRole("button", { name: "Go down one floor" });

    expect(up).toBeDisabled();
    expect(view.queryByTestId("mine-survey")).not.toBeInTheDocument();
    expect(view.container.querySelector("[data-mine-floor-record]")).toHaveAttribute(
      "data-compact",
      "true",
    );
    await fireEvent.click(down);
    expect(view.getByRole("group", { name: "Mine floor, 1 of 60" })).toBeInTheDocument();
  });
});
