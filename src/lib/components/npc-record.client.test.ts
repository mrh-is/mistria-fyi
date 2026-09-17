import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import NpcRecordHarness from "$lib/components/npc-record.test-harness.svelte";
import { userState } from "$lib/stores/user-state.svelte.js";

import type { Npc, NpcId } from "$lib/types/tracker-data.js";

const adelineId = "adeline" as NpcId;
const balorId = "balor" as NpcId;
const adeline: Npc = {
  birthday: { day: 3, season: "spring" },
  dateable: true,
  smallIconSprite: "spr_npc_adeline_small",
};
const balor: Npc = {
  birthday: { day: 10, season: "summer" },
};

describe("NpcRecord", () => {
  beforeEach(() => {
    userState.resetAll();
  });

  afterEach(() => {
    userState.resetAll();
  });

  it("renders a known dateable NPC as one compact, accessible record", () => {
    userState.setNpcLevel(adelineId, 8);
    const view = render(NpcRecordHarness, { id: adelineId, name: "Adeline", npc: adeline });

    expect(view.getByText("Adeline")).toBeInTheDocument();
    expect(view.getByText("SPR 03")).toHaveAccessibleName("Birthday: Spring 3");
    expect(view.container.querySelector("img")).toHaveAttribute(
      "src",
      "/npc-sprites/spr_npc_adeline_small.webp",
    );
    expect(view.container.querySelector("img")).toHaveAttribute("alt", "");
    expect(view.container.querySelectorAll("[data-npc-mark]")).toHaveLength(12);
    expect(view.container.querySelectorAll('[data-npc-mark-filled="true"]')).toHaveLength(8);
    expect(
      view.getByRole("group", { name: "Adeline relationship level, 8 of 12" }),
    ).toBeInTheDocument();
    expect(view.getByRole("button", { name: "Decrease Adeline hearts" })).toBeEnabled();
    expect(view.getByRole("button", { name: "Increase Adeline hearts" })).toBeEnabled();
    expect(view.getByRole("button", { name: "Best friends" })).toBeInTheDocument();
    expect(view.getByRole("button", { name: "Start dating" })).toBeInTheDocument();
  });

  it("falls back to a stable initial when the local icon is absent or fails", async () => {
    const absent = render(NpcRecordHarness, { id: balorId, name: "Balor", npc: balor });
    expect(absent.getByTestId("npc-icon-fallback")).toHaveTextContent("B");

    const failed = render(NpcRecordHarness, { id: adelineId, name: "Adeline", npc: adeline });
    const image = failed.container.querySelector("img");
    if (!image) throw new Error("Expected NPC icon image");
    await fireEvent.error(image);
    expect(failed.container.querySelector('[data-testid="npc-icon-fallback"]')).toHaveTextContent(
      "A",
    );
  });

  it("keeps an unmet NPC in place without exposing identity or stored progress", async () => {
    userState.setNpcLevel(adelineId, 6);
    const view = render(NpcRecordHarness, {
      id: adelineId,
      known: false,
      name: "Adeline",
      npc: adeline,
    });

    expect(view.getByRole("button", { name: "Reveal spoiler" })).toBeInTheDocument();
    expect(view.getByText("Birthday hidden")).toBeInTheDocument();
    expect(view.container.querySelectorAll('[data-npc-mark-filled="true"]')).toHaveLength(0);
    expect(
      view.getByRole("group", { name: "Hidden NPC relationship level, 0 of 12" }),
    ).toBeInTheDocument();
    expect(view.getByRole("button", { name: "Decrease hidden NPC hearts" })).toBeDisabled();
    expect(view.queryByRole("button", { name: /Adeline hearts/ })).not.toBeInTheDocument();

    await fireEvent.click(view.getByRole("button", { name: "Reveal spoiler" }));
    expect(
      view.getByRole("group", { name: "Adeline relationship level, 6 of 12" }),
    ).toBeInTheDocument();
  });

  it("renders non-dateable marks without relationship decisions", () => {
    const view = render(NpcRecordHarness, {
      compact: true,
      id: balorId,
      name: "Balor",
      npc: balor,
    });

    expect(view.container.querySelectorAll('[data-npc-mark-kind="platonic"]')).toHaveLength(12);
    expect(view.container.querySelector("[data-npc-record]")).toHaveAttribute(
      "data-compact",
      "true",
    );
    expect(view.queryByText("Choose path")).not.toBeInTheDocument();
  });

  it("advances through only the next relationship decisions and preserves focus", async () => {
    userState.setNpcLevel(adelineId, 10);
    userState.setNpcRelationship(adelineId, "romantic");
    const view = render(NpcRecordHarness, { id: adelineId, name: "Adeline", npc: adeline });

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
    expect(document.activeElement).toBe(view.container.querySelector("[data-npc-record]"));
  });

  it("updates level only through bounded adjacent controls", async () => {
    const view = render(NpcRecordHarness, { id: adelineId, name: "Adeline", npc: adeline });
    const decrement = view.getByRole("button", { name: "Decrease Adeline hearts" });
    const increment = view.getByRole("button", { name: "Increase Adeline hearts" });

    expect(decrement).toBeDisabled();
    await fireEvent.click(increment);
    expect(
      view.getByRole("group", { name: "Adeline relationship level, 1 of 12" }),
    ).toBeInTheDocument();

    userState.setNpcLevel(adelineId, 12);
    await waitFor(() => {
      expect(increment).toBeDisabled();
    });
  });
});
