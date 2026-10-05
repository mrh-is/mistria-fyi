import { afterEach, describe, expect, it, vi } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";

import { createSpoilerGuard } from "./spoiler-guard.svelte.js";

import type { VisibilityCondition } from "#lib/types/visibility.js";

const FLOOR_CONDITION: VisibilityCondition = { type: "minesLevel", floor: 12 };

describe("createSpoilerGuard", () => {
  afterEach(() => {
    userState.resetAll();
  });

  it("starts closed with no condition", () => {
    const guard = createSpoilerGuard();

    expect(guard.open).toBe(false);
    expect(guard.condition).toBeNull();
  });

  it("opens & holds the action without running it", () => {
    const guard = createSpoilerGuard();
    const action = vi.fn();

    guard.guard(FLOOR_CONDITION, action);

    expect(guard.open).toBe(true);
    expect(guard.condition).toEqual(FLOOR_CONDITION);
    expect(action).not.toHaveBeenCalled();
  });

  it("treats an undefined condition as none", () => {
    const guard = createSpoilerGuard();

    guard.guard(undefined, vi.fn());

    expect(guard.open).toBe(true);
    expect(guard.condition).toBeNull();
  });

  it("cancel drops the action & leaves progress untouched", () => {
    const guard = createSpoilerGuard();
    const action = vi.fn();
    guard.guard(FLOOR_CONDITION, action);

    guard.cancel();

    expect(action).not.toHaveBeenCalled();
    expect(guard.open).toBe(false);
    expect(guard.condition).toBeNull();
    expect(userState.state.completed.mines.floor).toBe(0);
    guard.complete();
    expect(action).not.toHaveBeenCalled();
  });

  it("complete runs the action once without changing progress", () => {
    const guard = createSpoilerGuard();
    const action = vi.fn();
    guard.guard(FLOOR_CONDITION, action);

    guard.complete();
    guard.complete();

    expect(action).toHaveBeenCalledTimes(1);
    expect(guard.open).toBe(false);
    expect(guard.condition).toBeNull();
    expect(userState.state.completed.mines.floor).toBe(0);
  });

  it("completeAndUpdate satisfies the condition, then runs the action", () => {
    const guard = createSpoilerGuard();
    const action = vi.fn(() => {
      expect(userState.state.completed.mines.floor).toBe(12);
    });
    guard.guard(FLOOR_CONDITION, action);

    guard.completeAndUpdate();

    expect(action).toHaveBeenCalledTimes(1);
    expect(userState.state.completed.mines.floor).toBe(12);
    expect(guard.open).toBe(false);
    expect(guard.condition).toBeNull();
  });

  it("completeAndUpdate with no condition still runs the action", () => {
    const guard = createSpoilerGuard();
    const action = vi.fn();
    guard.guard(undefined, action);

    guard.completeAndUpdate();

    expect(action).toHaveBeenCalledTimes(1);
    expect(userState.hasAnyProgress).toBe(false);
  });

  it("lets the dialog close itself by assigning open", () => {
    const guard = createSpoilerGuard();
    guard.guard(FLOOR_CONDITION, vi.fn());

    guard.open = false;

    expect(guard.open).toBe(false);
  });
});
