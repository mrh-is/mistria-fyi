import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import ClockPanel from "#lib/components/clock-panel.svelte";
import { userState } from "#lib/stores/user-state.svelte.js";

function weatherStrip() {
  return screen.getByRole("radiogroup", { name: "Weather" });
}

describe("ClockPanel", () => {
  it("selects a season and relabels the weather strip for it", async () => {
    render(ClockPanel);

    const seasons = screen.getByRole("radiogroup", { name: "Season" });
    expect(within(seasons).getByRole("radio", { name: "Spring" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(weatherStrip()).getByRole("radio", { name: "Rain" })).toBeInTheDocument();

    await fireEvent.click(within(seasons).getByRole("radio", { name: "Winter" }));

    expect(within(seasons).getByRole("radio", { name: "Winter" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(userState.state.worldState.season).toBe("winter");
    await waitFor(() => {
      expect(within(weatherStrip()).getByRole("radio", { name: "Snow" })).toBeInTheDocument();
    });
    expect(within(weatherStrip()).getByRole("radio", { name: "Blizzard" })).toBeInTheDocument();
  });

  it("selects weather and falls back to calm when the season loses that weather", async () => {
    render(ClockPanel);

    const breeze = within(weatherStrip()).getByRole("radio", { name: "Breeze" });
    expect(breeze).toBeEnabled();
    await fireEvent.click(breeze);
    expect(breeze).toHaveAttribute("aria-checked", "true");
    expect(userState.state.worldState.weather).toBe("special");

    await fireEvent.click(screen.getByRole("radio", { name: "Summer" }));

    await waitFor(() => {
      expect(userState.state.worldState.weather).toBe("calm");
    });
    expect(within(weatherStrip()).getByRole("radio", { name: "Sun" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // The special-weather slot stays in the DOM (for the collapse animation) but leaves the
    // accessibility tree and tab order.
    const special = within(weatherStrip()).getByLabelText("Breeze");
    expect(special).toBeDisabled();
    expect(special).toHaveAttribute("aria-hidden", "true");
    expect(special).toHaveAttribute("tabindex", "-1");
  });

  it("skips the collapsed weather slot when jumping and wrapping", async () => {
    render(ClockPanel);

    await fireEvent.click(screen.getByRole("radio", { name: "Summer" }));
    const sun = within(weatherStrip()).getByRole("radio", { name: "Sun" });
    const options = within(weatherStrip()).getAllByRole("radio");
    expect(options).toHaveLength(3);
    const last = within(weatherStrip()).getByRole("radio", { name: "Storm" });
    sun.focus();

    await fireEvent.keyDown(sun, { key: "End" });
    expect(last).toHaveFocus();
    expect(last).toHaveAttribute("aria-checked", "true");

    await fireEvent.keyDown(last, { key: "ArrowRight" });
    expect(sun).toHaveFocus();
    expect(sun).toHaveAttribute("aria-checked", "true");
  });

  it("models season as a radiogroup with arrow-key selection", async () => {
    render(ClockPanel);

    const seasons = screen.getByRole("radiogroup", { name: "Season" });
    const spring = within(seasons).getByRole("radio", { name: "Spring" });
    expect(spring).toHaveAttribute("tabindex", "0");
    expect(within(seasons).getByRole("radio", { name: "Summer" })).toHaveAttribute(
      "tabindex",
      "-1",
    );

    spring.focus();
    await fireEvent.keyDown(spring, { key: "ArrowRight" });
    const summer = within(seasons).getByRole("radio", { name: "Summer" });
    expect(summer).toHaveFocus();
    expect(summer).toHaveAttribute("aria-checked", "true");
    expect(userState.state.worldState.season).toBe("summer");
    expect(within(seasons).queryAllByRole("radio", { checked: true })).toHaveLength(1);
  });
});
