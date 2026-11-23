import { fireEvent, waitFor, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";

import VillagersContent from "#lib/components/villagers-content.svelte";
import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { MAX_HEART_LEVEL } from "#lib/engine/progress.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { recordKeys } from "#lib/utils/record.js";

import type { VillagerId } from "#lib/types/tracker-data.js";

describe("VillagersContent localization", () => {
  beforeEach(async () => {
    await userState.startTrackingByHand();
  });

  it("reveals the setting with romance and supports turning it on and off", async () => {
    const view = renderWithFeedback(VillagersContent, { locale: "en" });
    expect(view.queryByRole("switch")).not.toBeInTheDocument();
    userState.setVillagerRelationship("adeline" as VillagerId, "romantic");
    const toggle = await view.findByRole("switch", {
      name: getName("ui", "disable_break_ups", "en"),
    });
    expect(
      view.getByText("Match this to your game’s setting before you get engaged."),
    ).toBeVisible();
    expect(view.container).not.toHaveTextContent(
      getName("ui", "disable_break_ups_description", "en"),
    );
    await fireEvent.click(toggle);
    expect(userState.state.progress.breakUpsDisabled).toBe(true);
    await fireEvent.click(toggle);
    expect(userState.state.progress.breakUpsDisabled).toBe(false);
  });

  it.each(["proposed", "married"] as const)(
    "puts a read-only setting after the roster when %s, for either setting value",
    async (relationship) => {
      userState.setVillagerRelationship("adeline" as VillagerId, relationship);
      const view = renderWithFeedback(VillagersContent, { locale: "en" });
      expect(view.queryByRole("switch")).not.toBeInTheDocument();
      const line = view.getByText("Break-ups enabled");
      const roster = view.getByTestId("villager-roster");
      expect(roster.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      userState.setBreakUpsDisabled(true);
      await waitFor(() => expect(view.getByText("Break-ups disabled")).toBeVisible());
      expect(view.queryByRole("switch")).not.toBeInTheDocument();
    },
  );

  it("hides the household setting in compact rosters", () => {
    userState.setBreakUpsDisabled(true);
    const view = renderWithFeedback(VillagersContent, { compact: true, locale: "en" });
    expect(view.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("renders English names under the en locale", () => {
    const view = renderWithFeedback(VillagersContent, { locale: "en" });

    const roster = within(view.getByTestId("villager-roster"));
    expect(roster.getByText("Balor")).toBeInTheDocument();
    expect(roster.getByText("Adeline")).toBeInTheDocument();
  });

  it("renders localized names under a non-Latin locale", () => {
    const view = renderWithFeedback(VillagersContent, { locale: "ja" });

    const roster = within(view.getByTestId("villager-roster"));
    expect(roster.getByText("バロル")).toBeInTheDocument();
    expect(roster.getByText("アデライン")).toBeInTheDocument();
    expect(roster.queryByText("Balor")).not.toBeInTheDocument();
  });
});

describe("VillagersContent ledger", () => {
  beforeEach(async () => {
    await userState.startTrackingByHand();
  });

  it("keeps unmet names and progress out of the rows and birthday rail", () => {
    const id = recordKeys(trackerData.villagers).find(
      (villager) => !userState.progressionState.knownVillagers.has(villager),
    );
    if (!id) throw new Error("Expected an unmet villager");
    userState.setHeartLevel(id, MAX_HEART_LEVEL);

    const view = renderWithFeedback(VillagersContent, { locale: "en" });
    const record = view.container.querySelector(`#villager-${id}`);
    expect(record).toHaveTextContent("Hidden villager");
    expect(record).not.toHaveTextContent(getName("villagers", id, "en"));
    expect(record?.querySelector('[data-sprite-treatment="spoiler"]')).toBeInTheDocument();
    expect(record?.querySelector('[role="slider"]')).toBeNull();
    expect(view.getByText("Not met yet")).toBeInTheDocument();
    expect(view.container.querySelector(`a[href="#villager-${id}"]`)).toBeNull();
  });

  it("moves a villager at ten hearts and keeps the same focused slider", async () => {
    const view = renderWithFeedback(VillagersContent, { locale: "en" });
    const slider = view.getByRole("slider", { name: "Adeline heart level" });
    slider.focus();
    await fireEvent.keyDown(slider, { key: "End" });
    expect(slider).toHaveAttribute("aria-valuetext", "Adeline, dateable, 10 of 10 hearts");
    expect(slider.querySelectorAll('[data-reached="true"]')).toHaveLength(10);
    const completed = view.getByRole("heading", { name: "Completed" });
    expect(
      completed.compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(slider).toHaveFocus();

    await fireEvent.keyDown(slider, { key: "Home" });
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    expect(slider.querySelectorAll('[data-reached="true"]')).toHaveLength(0);
    expect(slider).toHaveFocus();
  });
});

describe("VillagersContent completed shelf", () => {
  const [completed, other] = recordKeys(trackerData.villagers).filter(
    (id) => !trackerData.villagers[id].dateable,
  );

  beforeEach(async () => {
    await userState.startTrackingByHand();
    userState.setHeartLevel(completed, MAX_HEART_LEVEL);
    userState.setHeartLevel(other, MAX_HEART_LEVEL);
  });

  it("keeps direct links available for villagers on the Completed shelf", () => {
    pageStub.navigate(`/en/villagers#villager-${completed}`);

    const view = renderWithFeedback(VillagersContent, { locale: "en" });

    expect(view.container.querySelector(`#villager-${completed}`)).not.toBeNull();
    expect(view.container.querySelector(`#villager-${other}`)).not.toBeNull();
  });

  it("keeps the row and its focus after settling a relationship", async () => {
    const dateable = recordKeys(trackerData.villagers).find(
      (id) => trackerData.villagers[id].dateable,
    );
    if (!dateable) throw new Error("fixture has no dateable villager");
    userState.setHeartLevel(dateable, MAX_HEART_LEVEL);
    const view = renderWithFeedback(VillagersContent, { locale: "en" });
    const record = view.container.querySelector<HTMLElement>(`#villager-${dateable}`);
    const bestFriend = record?.querySelector<HTMLButtonElement>("[data-relationship-action]");
    if (!bestFriend) throw new Error("Best Friend action missing");
    expect(bestFriend).toHaveTextContent("Best Friend");
    bestFriend.focus();

    await fireEvent.click(bestFriend);

    await waitFor(() => expect(record).toHaveFocus());
  });
});
