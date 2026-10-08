import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import VillagerRecordHarness from "#lib/components/villager-record.test-harness.svelte";
import { villagerSpriteUrl } from "#lib/sprites/sprite-url.js";
import { userState } from "#lib/stores/user-state.svelte.js";

import type { Villager, VillagerId } from "#lib/types/tracker-data.js";

const adelineId = "adeline" as VillagerId;
const balorId = "balor" as VillagerId;
const adeline: Villager = {
  birthday: { day: 3, season: "spring" },
  dateable: true,
};
const balor: Villager = {
  birthday: { day: 10, season: "summer" },
};

describe("VillagerRecord", () => {
  beforeEach(() => {
    userState.resetAll();
  });

  afterEach(() => {
    userState.resetAll();
  });

  it("renders a known dateable Villager as one compact, accessible record", () => {
    userState.setHeartLevel(adelineId, 8);
    const view = render(VillagerRecordHarness, {
      id: adelineId,
      name: "Adeline",
      villager: adeline,
    });

    expect(view.getByText("Adeline")).toBeInTheDocument();
    expect(view.getByText("SPR 03")).toHaveAccessibleName("Birthday: Spring 3");
    expect(view.container.querySelector("img")).toHaveAttribute(
      "src",
      villagerSpriteUrl(adelineId),
    );
    expect(view.container.querySelector("img")).toHaveAttribute("alt", "");
    expect(view.container.querySelector("img")).toHaveAttribute("crossorigin", "anonymous");
    expect(view.container.querySelectorAll("[data-villager-mark]")).toHaveLength(12);
    expect(view.container.querySelectorAll("[data-villager-mark] button")).toHaveLength(0);
    expect(view.container.querySelectorAll('[data-villager-mark-filled="true"]')).toHaveLength(8);
    expect(
      view.getByRole("group", { name: "Adeline relationship level, 8 of 12" }),
    ).toBeInTheDocument();
    expect(view.getByRole("button", { name: "Decrease Adeline hearts" })).toBeEnabled();
    expect(view.getByRole("button", { name: "Increase Adeline hearts" })).toBeEnabled();
    expect(view.getByRole("button", { name: "Best Friend" })).toBeInTheDocument();
    expect(view.getByRole("button", { name: "Start dating" })).toBeInTheDocument();
  });

  it("falls back to a stable initial when the sprite image fails to load", async () => {
    const absent = render(VillagerRecordHarness, { id: balorId, name: "Balor", villager: balor });
    const absentImage = absent.container.querySelector("img");
    if (!absentImage) throw new Error("Expected Villager icon image");
    await fireEvent.error(absentImage);
    expect(absent.getByTestId("villager-icon-fallback")).toHaveTextContent("B");

    const failed = render(VillagerRecordHarness, {
      id: adelineId,
      name: "Adeline",
      villager: adeline,
    });
    const image = failed.container.querySelector("img");
    if (!image) throw new Error("Expected Villager icon image");
    await fireEvent.error(image);
    expect(
      failed.container.querySelector('[data-testid="villager-icon-fallback"]'),
    ).toHaveTextContent("A");
  });

  it("keeps an unmet Villager in place without exposing identity or stored progress", async () => {
    userState.setHeartLevel(adelineId, 6);
    const view = render(VillagerRecordHarness, {
      id: adelineId,
      name: "Adeline",
      spoilered: true,
      villager: adeline,
    });

    expect(view.getByRole("button", { name: "Reveal spoiler" })).toBeInTheDocument();
    expect(view.getByText("Birthday hidden")).toBeInTheDocument();
    expect(view.container.querySelectorAll('[data-villager-mark-filled="true"]')).toHaveLength(0);
    expect(
      view.getByRole("group", { name: "Hidden villager relationship level, 0 of 12" }),
    ).toBeInTheDocument();
    expect(view.getByRole("button", { name: "Decrease hidden villager hearts" })).toBeDisabled();
    expect(view.queryByRole("button", { name: /Adeline hearts/ })).not.toBeInTheDocument();

    await fireEvent.click(view.getByRole("button", { name: "Reveal spoiler" }));
    expect(
      view.getByRole("group", { name: "Adeline relationship level, 6 of 12" }),
    ).toBeInTheDocument();
  });

  it("renders non-dateable marks without relationship decisions", () => {
    const view = render(VillagerRecordHarness, {
      compact: true,
      id: balorId,
      name: "Balor",
      villager: balor,
    });

    expect(view.container.querySelectorAll('[data-villager-mark-kind="platonic"]')).toHaveLength(
      12,
    );
    expect(view.container.querySelector("[data-villager-record]")).toHaveAttribute(
      "data-compact",
      "true",
    );
    expect(view.queryByText("Choose path")).not.toBeInTheDocument();
  });

  it("advances through only the next relationship decisions and preserves focus", async () => {
    userState.setHeartLevel(adelineId, 10);
    userState.setVillagerRelationship(adelineId, "romantic");
    const view = render(VillagerRecordHarness, {
      id: adelineId,
      name: "Adeline",
      villager: adeline,
    });

    await fireEvent.click(view.getByRole("button", { name: "Record proposal" }));
    const marriage = await view.findByRole("button", { name: "Record marriage" });
    expect(view.getByText("Engaged")).toBeInTheDocument();
    expect(marriage).toHaveAccessibleDescription(/closes every other romantic path/i);
    expect(document.activeElement).toBe(marriage);

    await fireEvent.click(marriage);
    const kids = await view.findByRole("button", { name: "Kids" });
    expect(view.getByRole("button", { name: "Child-free" })).toBeInTheDocument();
    expect(document.activeElement).toBe(kids);

    await fireEvent.click(view.getByRole("button", { name: "Child-free" }));
    await waitFor(() => {
      expect(view.getByText("Married · child-free")).toBeInTheDocument();
    });
    expect(document.activeElement).toBe(view.container.querySelector("[data-villager-record]"));
  });

  it("updates level only through bounded adjacent controls", async () => {
    const view = render(VillagerRecordHarness, {
      id: adelineId,
      name: "Adeline",
      villager: adeline,
    });
    const decrement = view.getByRole("button", { name: "Decrease Adeline hearts" });
    const increment = view.getByRole("button", { name: "Increase Adeline hearts" });

    expect(decrement).toBeDisabled();
    await fireEvent.click(increment);
    expect(
      view.getByRole("group", { name: "Adeline relationship level, 1 of 12" }),
    ).toBeInTheDocument();

    userState.setHeartLevel(adelineId, 12);
    await waitFor(() => {
      expect(increment).toBeDisabled();
    });
  });

  it("announces level changes through a status region, not the whole meter group", async () => {
    const view = render(VillagerRecordHarness, {
      id: adelineId,
      name: "Adeline",
      villager: adeline,
    });
    const group = view.getByRole("group", { name: /Adeline relationship level/ });
    expect(group).not.toHaveAttribute("aria-live");

    await fireEvent.click(view.getByRole("button", { name: "Increase Adeline hearts" }));
    expect(view.getByRole("status")).toHaveTextContent("Adeline relationship level, 1 of 12");
  });
});
