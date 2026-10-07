import { afterEach, describe, expect, it, vi } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";

import { createSpoilerGuard } from "./spoiler-guard.svelte.js";

import type { VillagerId } from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

const FLOOR_CONDITION: VisibilityCondition = { type: "mineFloor", floor: 12 };

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

    guard.requestGuardedAction(FLOOR_CONDITION, action);

    expect(guard.open).toBe(true);
    expect(guard.condition).toEqual(FLOOR_CONDITION);
    expect(action).not.toHaveBeenCalled();
  });

  it("treats an undefined condition as none", () => {
    const guard = createSpoilerGuard();

    guard.requestGuardedAction(undefined, vi.fn());

    expect(guard.open).toBe(true);
    expect(guard.condition).toBeNull();
  });

  it("cancel drops the action & leaves progress untouched", () => {
    const guard = createSpoilerGuard();
    const action = vi.fn();
    guard.requestGuardedAction(FLOOR_CONDITION, action);

    guard.cancel();

    expect(action).not.toHaveBeenCalled();
    expect(guard.open).toBe(false);
    expect(guard.condition).toBeNull();
    expect(userState.state.completed.mineFloor).toBe(0);
    guard.proceed();
    expect(action).not.toHaveBeenCalled();
  });

  it("proceed runs the action once without changing progress", () => {
    const guard = createSpoilerGuard();
    const action = vi.fn();
    guard.requestGuardedAction(FLOOR_CONDITION, action);

    guard.proceed();
    guard.proceed();

    expect(action).toHaveBeenCalledTimes(1);
    expect(guard.open).toBe(false);
    expect(guard.condition).toBeNull();
    expect(userState.state.completed.mineFloor).toBe(0);
  });

  it("proceedAndRecordPrerequisites satisfies the condition, then runs the action", () => {
    const guard = createSpoilerGuard();
    const action = vi.fn(() => {
      expect(userState.state.completed.mineFloor).toBe(12);
    });
    guard.requestGuardedAction(FLOOR_CONDITION, action);

    guard.proceedAndRecordPrerequisites();

    expect(action).toHaveBeenCalledTimes(1);
    expect(userState.state.completed.mineFloor).toBe(12);
    expect(guard.open).toBe(false);
    expect(guard.condition).toBeNull();
  });

  it("applies level caps through store setters before running the action", () => {
    const guard = createSpoilerGuard();
    guard.requestGuardedAction({ type: "renownLevel", level: 1_000_000 }, () => {
      expect(userState.state.completed.renown).toBeLessThan(1_000_000);
    });
    guard.proceedAndRecordPrerequisites();
  });

  it("resets child choice when satisfying a new marriage", () => {
    const villagerId = "holt" as VillagerId;
    userState.setChildChoice("yes");
    const guard = createSpoilerGuard();
    guard.requestGuardedAction({ type: "married", villagerId }, vi.fn());
    guard.proceedAndRecordPrerequisites();
    expect(userState.state.completed.villagerRelationships[villagerId]).toBe("married");
    expect(userState.state.completed.childChoice).toBe("undeclared");
  });

  it("proceedAndRecordPrerequisites with no condition still runs the action", () => {
    const guard = createSpoilerGuard();
    const action = vi.fn();
    guard.requestGuardedAction(undefined, action);

    guard.proceedAndRecordPrerequisites();

    expect(action).toHaveBeenCalledTimes(1);
    expect(userState.hasAnyProgress).toBe(false);
  });

  it("lets the dialog close itself by assigning open", () => {
    const guard = createSpoilerGuard();
    guard.requestGuardedAction(FLOOR_CONDITION, vi.fn());

    guard.open = false;

    expect(guard.open).toBe(false);
  });
});
