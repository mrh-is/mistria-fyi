import { fireEvent, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";

import VillagersContent from "#lib/components/villagers-content.svelte";
import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { MAX_HEART_LEVEL } from "#lib/engine/progress.js";
import { buildVillagerRoster } from "#lib/engine/villager-roster.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { recordKeys } from "#lib/utils/record.js";

import type { VillagerId } from "#lib/types/tracker-data.js";

describe("VillagersContent localization", () => {
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

    expect(view.getByText("Balor")).toBeInTheDocument();
    expect(view.getByText("Adeline")).toBeInTheDocument();
  });

  it("renders localized names under a non-Latin locale", () => {
    const view = renderWithFeedback(VillagersContent, { locale: "ja" });

    expect(view.getByText("バロル")).toBeInTheDocument();
    expect(view.getByText("アデライン")).toBeInTheDocument();
    expect(view.queryByText("Balor")).not.toBeInTheDocument();
  });
});

describe("VillagersContent alphabet index", () => {
  it("omits initials that only spoilered villagers start with", () => {
    const { knownVillagers } = userState.progressionState;
    const roster = buildVillagerRoster("en");
    const initialOf = (villager: (typeof roster)[number]) =>
      villager.name.charAt(0).toLocaleUpperCase("en");
    const knownInitials = new Set(
      roster
        .filter((villager) => knownVillagers.has(villager.id))
        .map((villager) => initialOf(villager)),
    );
    const hiddenOnly = roster
      .filter((villager) => !knownVillagers.has(villager.id))
      .map((villager) => initialOf(villager))
      .find((initial) => !knownInitials.has(initial));
    expect(hiddenOnly).toBeDefined();
    expect(knownInitials.size).toBeGreaterThan(0);

    const view = renderWithFeedback(VillagersContent, { indexed: true, locale: "en" });
    const letters = view.getAllByRole("button").map((button) => button.textContent.trim());

    for (const initial of knownInitials) expect(letters).toContain(initial);
    expect(letters).not.toContain(hiddenOnly);
  });
});

describe("VillagersContent with completed villagers hidden", () => {
  const [completed, other] = recordKeys(trackerData.villagers).filter(
    (id) => !trackerData.villagers[id].dateable,
  );

  beforeEach(() => {
    userState.setHeartLevel(completed, MAX_HEART_LEVEL);
    userState.setHeartLevel(other, MAX_HEART_LEVEL);
  });

  it("opens the fold around the villager targeted by the URL hash", () => {
    pageStub.navigate(`/en/villagers#villager-${completed}`);

    const view = renderWithFeedback(VillagersContent, { locale: "en" });

    expect(view.container.querySelector(`#villager-${completed}`)).not.toBeNull();
    expect(view.container.querySelector(`#villager-${other}`)).not.toBeNull();
  });

  it("moves focus to a remaining record when settling a relationship hides the focused one", async () => {
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

    await waitFor(() => {
      expect(view.container.querySelector(`#villager-${dateable}`)).toBeNull();
    });
    const focused = document.activeElement;
    expect(focused).toHaveAttribute("data-villager-record");
    expect(view.container.contains(focused)).toBe(true);
    expect(focused?.id).not.toBe(`villager-${dateable}`);
  });
});
