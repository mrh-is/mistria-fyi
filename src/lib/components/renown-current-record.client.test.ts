import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import RenownCurrentRecordHarness from "#lib/components/renown-current-record.test-harness.svelte";
import { getName } from "#lib/data/names.js";
import { getMaxRenownLevel } from "#lib/engine/progress.js";
import { userState } from "#lib/stores/user-state.svelte.js";

describe("RenownCurrentRecord", () => {
  beforeEach(() => {
    userState.resetAll();
  });
  afterEach(() => {
    userState.resetAll();
  });

  it("shows one current-rank impression and a raw overall progress value", () => {
    const view = render(RenownCurrentRecordHarness);
    const maxLevel = getMaxRenownLevel();

    expect(view.getByText(getName("town-ranks", "0", "en"))).toBeInTheDocument();
    expect(view.getByText("0 / 10 in rank")).toBeInTheDocument();
    expect(view.getByRole("progressbar", { name: "Renown progress" })).toHaveAttribute(
      "aria-valuemax",
      String(maxLevel),
    );
    expect(view.getByRole("progressbar", { name: "Renown progress" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(view.getByRole("group", { name: `Renown level, 0 of ${maxLevel}` })).toBeInTheDocument();
    expect(view.getByRole("spinbutton", { name: "Renown level" })).toHaveValue(0);
  });

  it("commits finite direct edits, changes rank at a boundary, and cancels invalid input", async () => {
    const view = render(RenownCurrentRecordHarness);
    const input = view.getByRole("spinbutton", { name: "Renown level" });
    await fireEvent.input(input, { target: { value: "10" } });
    await fireEvent.change(input);
    expect(view.getByText(getName("town-ranks", "1", "en"))).toBeInTheDocument();

    await fireEvent.input(input, { target: { value: "" } });
    await fireEvent.change(input);
    expect(input).toHaveValue(10);
  });

  it("clamps at both boundaries and exposes the compact variant", async () => {
    const view = render(RenownCurrentRecordHarness, { compact: true });
    const maxLevel = getMaxRenownLevel();
    expect(view.container.querySelector("[data-renown-current]")).toHaveAttribute(
      "data-compact",
      "true",
    );
    expect(view.getByRole("button", { name: "Decrease renown" })).toBeDisabled();

    userState.setRenown(maxLevel);
    await waitFor(() => {
      expect(view.getByRole("button", { name: "Increase renown" })).toBeDisabled();
    });
    expect(view.getByText("Max rank reached")).toBeInTheDocument();
  });
});
