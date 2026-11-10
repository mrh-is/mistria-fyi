import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it } from "vitest";

import WelcomeCard from "#lib/components/welcome-card.svelte";
import { userState } from "#lib/stores/user-state.svelte.js";
import * as m from "#lib/ui-messages/messages.js";

import type { ItemId, RecipeId } from "#lib/types/tracker-data.js";

const STARTER_RECIPE = "basic_wood_chest" as RecipeId;
const STARTER_COUNT = 293;

describe("WelcomeCard", () => {
  it("asks how to work, with sync or by hand", async () => {
    render(WelcomeCard);

    expect(screen.getByRole("heading", { name: m.sync_home_title() })).toBeVisible();
    expect(
      screen
        .getByRole("link", { name: (name) => name.startsWith(m.sync_home_sync()) })
        .getAttribute("href"),
    ).toMatch(/\/sync$/);

    await fireEvent.click(
      screen.getByRole("button", { name: (name) => name.startsWith(m.sync_home_hand()) }),
    );

    await waitFor(() => {
      expect(userState.trackingLane).toBe("manual");
      expect(userState.hasAnyProgress).toBe(true);
    });
    expect(userState.starterItems?.count).toBe(STARTER_COUNT);

    userState.starterItems?.undo();
    await tick();
    expect(userState.hasAnyProgress).toBe(false);
  });

  it("keeps the first check when the player undoes the starter items", async () => {
    await userState.startTrackingByHand();
    userState.toggleAlmanacRecipe(STARTER_RECIPE);
    const notice = userState.starterItems;
    expect(notice?.count).toBe(STARTER_COUNT - 1);
    expect(userState.provenanceOf(`almanacRecipes/${STARTER_RECIPE}`)?.source).toBe("manual");

    notice?.undo();

    expect([...userState.state.progress.almanacRecipes]).toEqual([STARTER_RECIPE]);
    expect(userState.state.progress.cosmetics.size).toBe(0);
    expect(
      Object.values(userState.state.progress.animals).every((variants) => !variants?.size),
    ).toBe(true);
  });

  it("keeps later hand edits to a starter item when the player undoes the batch", async () => {
    await userState.startTrackingByHand();
    userState.toggleAlmanacItem("turnip" as ItemId);
    const notice = userState.starterItems;
    expect(notice?.count).toBe(STARTER_COUNT);
    expect(userState.state.progress.almanacRecipes.has(STARTER_RECIPE)).toBe(true);
    userState.toggleAlmanacRecipe(STARTER_RECIPE);
    userState.toggleAlmanacRecipe(STARTER_RECIPE);

    notice?.undo();

    expect([...userState.state.progress.almanacRecipes]).toEqual([STARTER_RECIPE]);
    expect(userState.state.progress.almanac.has("turnip" as ItemId)).toBe(true);
  });

  it("does not reapply the starter items after undo and backup restore", () => {
    userState.markDefaultUnlocksComplete();
    expect(userState.starterItems?.count).toBe(STARTER_COUNT);
    userState.starterItems?.undo();
    const backup = userState.exportBackup();
    userState.resetAll();
    expect(userState.restoreBackup(backup)).toEqual({ ok: true });

    userState.toggleAlmanacItem("turnip" as ItemId);
    expect(userState.starterItems).toBeUndefined();
    expect(userState.state.progress.almanacRecipes.size).toBe(0);
  });

  it("accepts copy for a required tracking choice", () => {
    render(WelcomeCard, { body: "Choose before checking off.", title: "Choose how to track" });
    expect(screen.getByRole("heading", { name: "Choose how to track" })).toBeVisible();
    expect(screen.getByText("Choose before checking off.")).toBeVisible();
  });
});
