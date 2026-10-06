import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import Stepper from "#lib/components/stepper.svelte";

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

  it("uses the label alone when no value is given", () => {
    render(Stepper, {
      decrementLabel: "Go up a floor",
      incrementLabel: "Go down a floor",
      label: "Floor 12 of 100",
      onDecrement: vi.fn(),
      onIncrement: vi.fn(),
    });

    expect(screen.getByRole("group", { name: "Floor 12 of 100" })).toBeInTheDocument();
  });
});

describe("Stepper appearance", () => {
  it("takes its hover & focus accent from the caller", () => {
    render(Stepper, {
      accent: "var(--color-category-mines)",
      decrementLabel: "Go up a floor",
      incrementLabel: "Go down a floor",
      onDecrement: vi.fn(),
      onIncrement: vi.fn(),
    });

    const root = screen.getByRole("button", { name: "Go up a floor" }).parentElement;
    expect(root?.style.getPropertyValue("--stepper-accent")).toBe("var(--color-category-mines)");
  });

  it("marks both buttons as stepper targets and disables them independently", () => {
    const onDecrement = vi.fn();
    render(Stepper, {
      decrementDisabled: true,
      decrementLabel: "Decrease",
      incrementLabel: "Increase",
      onDecrement,
      onIncrement: vi.fn(),
    });

    const decrement = screen.getByRole("button", { name: "Decrease" });
    const increment = screen.getByRole("button", { name: "Increase" });
    expect(decrement).toHaveAttribute("data-stepper-button");
    expect(increment).toHaveAttribute("data-stepper-button");
    expect(decrement).toBeDisabled();
    expect(increment).toBeEnabled();
  });
});
