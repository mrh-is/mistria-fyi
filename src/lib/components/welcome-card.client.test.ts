import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import WelcomeCard from "#lib/components/welcome-card.svelte";
import { userState } from "#lib/stores/user-state.svelte.js";

import type { ItemId, RecipeId } from "#lib/types/tracker-data.js";

const STARTER_RECIPE = "basic_wood_chest" as RecipeId;

beforeEach(() => {
  userState.resetAll();
});

afterEach(async () => {
  cleanup();
  await tick();
});

describe("WelcomeCard", () => {
  it("asks how to work, with sync or by hand", async () => {
    render(WelcomeCard);

    expect(screen.getByRole("heading", { name: "Ready to get started?" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Sync from my farm automagically/ }).getAttribute("href"),
    ).toMatch(/\/sync$/);

    await fireEvent.click(screen.getByRole("button", { name: /I’ll track it all by hand/ }));

    expect(userState.hasAnyProgress).toBe(true);
    expect(screen.queryByRole("region", { name: "Getting started" })).toBeNull();
    expect(userState.starterItems?.count).toBe(296);

    userState.starterItems?.undo();
    await tick();
    expect(userState.hasAnyProgress).toBe(false);
    expect(screen.queryByRole("region", { name: "Getting started" })).toBeNull();
  });

  it("keeps the first check when the player undoes the starter items", () => {
    userState.toggleAlmanacRecipe(STARTER_RECIPE);
    const notice = userState.starterItems;
    expect(notice?.count).toBe(295);
    expect(userState.provenanceOf(`almanacRecipes/${STARTER_RECIPE}`)?.source).toBe("manual");

    notice?.undo();

    expect([...userState.state.progress.almanacRecipes]).toEqual([STARTER_RECIPE]);
    expect(userState.state.progress.cosmetics.size).toBe(0);
    expect(
      Object.values(userState.state.progress.animals).every((variants) => !variants?.size),
    ).toBe(true);
  });

  it("keeps later hand edits to a starter item when the player undoes the batch", () => {
    userState.toggleAlmanacItem("turnip" as ItemId);
    const notice = userState.starterItems;
    expect(notice?.count).toBe(296);
    expect(userState.state.progress.almanacRecipes.has(STARTER_RECIPE)).toBe(true);
    userState.toggleAlmanacRecipe(STARTER_RECIPE);
    userState.toggleAlmanacRecipe(STARTER_RECIPE);

    notice?.undo();

    expect([...userState.state.progress.almanacRecipes]).toEqual([STARTER_RECIPE]);
    expect(userState.state.progress.almanac.has("turnip" as ItemId)).toBe(true);
  });

  it("does not reapply the starter items after undo and backup restore", () => {
    userState.markDefaultUnlocksComplete();
    expect(userState.starterItems?.count).toBe(296);
    userState.starterItems?.undo();
    const backup = userState.exportBackup();
    userState.resetAll();
    expect(userState.restoreBackup(backup)).toEqual({ ok: true });

    userState.toggleAlmanacItem("turnip" as ItemId);
    expect(userState.starterItems).toBeUndefined();
    expect(userState.state.progress.almanacRecipes.size).toBe(0);
  });

  it("returns after a full reset leaves no tracked progress", async () => {
    render(WelcomeCard);
    await fireEvent.click(screen.getByRole("button", { name: /I’ll track it all by hand/ }));

    userState.resetAll();

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Getting started" })).toBeVisible();
    });
    expect(userState.hasAnyProgress).toBe(false);
  });
});
