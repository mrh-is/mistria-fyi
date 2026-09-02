import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import Stepper from "$lib/components/stepper.svelte";

describe("Stepper accessibility", () => {
  it("groups its controls with the current value", () => {
    render(Stepper, {
      decrementLabel: "Decrease Mining level",
      incrementLabel: "Increase Mining level",
      label: "Mining level",
      onDecrement: vi.fn(),
      onIncrement: vi.fn(),
      value: "12 of 60",
    });

    expect(screen.getByRole("group", { name: "Mining level, 12 of 60" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decrease Mining level" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Increase Mining level" })).toBeInTheDocument();
  });
});
