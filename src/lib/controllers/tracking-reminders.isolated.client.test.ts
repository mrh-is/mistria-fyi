import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { memoryStorage } from "#lib/test-utils/memory-storage.js";

const notifications = vi.hoisted(() => ({ dismiss: vi.fn(), show: vi.fn(() => 1) }));
vi.mock("svelte-sonner", () => ({
  toast: Object.assign(notifications.show, { dismiss: notifications.dismiss }),
}));

const persist = vi.fn(() => Promise.resolve(false));

async function open(ios = true) {
  vi.stubGlobal("navigator", {
    maxTouchPoints: ios ? 5 : 0,
    platform: ios ? "iPhone" : "Linux",
    storage: { persist },
    userAgent: ios ? "iPhone Safari" : "Firefox",
  });
  const { userState } = await import("#lib/stores/user-state.svelte.js");
  const { trackingReminders } = await import("./tracking-reminders.svelte.js");
  userState.loadFromStorage();
  return { controller: trackingReminders, store: userState };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", memoryStorage({}));
});
afterEach(async () => {
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("requests persistence and shows the install transfer steps when choosing by hand on iOS", async () => {
  const { controller, store } = await open();
  expect(await controller.chooseHandTracking()).toBe(true);
  expect(store.trackingLane).toBe("manual");
  expect(persist).toHaveBeenCalledTimes(1);
  expect(controller.installOpen).toBe(true);
  expect(store.reminders?.install).toMatchObject({
    fingerprint: store.progressFingerprint,
  });
  expect(store.reminders?.install?.shownAt).toBeTypeOf("number");
  controller.closeInstall(true);
  await controller.opened();
  expect(controller.installOpen).toBe(false);
  expect(store.reminders?.install?.dismissed).toBe(true);
  expect(store.reminders?.lastOpenedAt).toEqual(expect.any(Number));
});

it("does not nudge non-iOS players but still requests persistence", async () => {
  const { controller } = await open(false);
  await controller.chooseHandTracking();
  expect(persist).toHaveBeenCalledTimes(1);
  expect(controller.installOpen).toBe(false);
});

it("treats a denied persistence request as best effort", async () => {
  persist.mockRejectedValueOnce(new DOMException("Denied", "SecurityError"));
  const { controller, store } = await open(false);
  expect(await controller.chooseHandTracking()).toBe(true);
  expect(store.trackingLane).toBe("manual");
});

it("waits to suggest a due backup until installation guidance closes", async () => {
  const { controller, store } = await open();
  await controller.chooseHandTracking();
  const { trackerData } = await import("#lib/data/index.js");
  const ids = Object.keys(trackerData.items).slice(0, 110);
  expect(ids).toHaveLength(110);
  for (const id of ids) store.toggleAlmanacItem(id as keyof typeof trackerData.items);
  expect(store.factCount).toBeGreaterThanOrEqual(100);
  await controller.checkBackup();
  expect(notifications.show).not.toHaveBeenCalled();
  controller.closeInstall();
  await controller.checkBackup();
  expect(notifications.show).toHaveBeenCalledTimes(1);
  expect(store.reminders?.backupFacts).toBe(store.factCount);
  await controller.checkBackup();
  expect(notifications.show).toHaveBeenCalledTimes(1);
});

it("queues an install check while a backup write waits for another tab", async () => {
  const { controller, store } = await open();
  await store.startTrackingByHand();
  const { trackerData } = await import("#lib/data/index.js");
  for (const id of Object.keys(trackerData.items).slice(0, 110)) {
    store.toggleAlmanacItem(id as keyof typeof trackerData.items);
  }
  expect(store.factCount).toBeGreaterThanOrEqual(100);
  const gate = Promise.withResolvers<undefined>();
  const request = vi.fn(async (_name: string, action: () => unknown) => {
    await gate.promise;
    return action();
  });
  vi.stubGlobal("navigator", {
    locks: { request },
    maxTouchPoints: 5,
    platform: "iPhone",
    userAgent: "iPhone Safari",
  });
  const backup = controller.checkBackup();
  await vi.waitFor(() => {
    expect(request).toHaveBeenCalledWith("mistria-fyi:progress-write", expect.any(Function));
  });
  const install = controller.checkInstall("milestone");
  gate.resolve(undefined);
  await Promise.all([backup, install]);
  expect(controller.installOpen).toBe(true);
  expect(notifications.dismiss).toHaveBeenCalledWith(1);
});

it("suggests another backup after resetting a large previous collection", async () => {
  const { controller, store } = await open(false);
  await store.startTrackingByHand();
  await store.updateReminders(() => ({ backupFacts: 1000, install: { dismissed: true } }));
  store.resetProgress();
  const { trackerData } = await import("#lib/data/index.js");
  for (const id of Object.keys(trackerData.items).slice(0, 100)) {
    store.toggleAlmanacItem(id as keyof typeof trackerData.items);
  }
  expect(store.factCount).toBe(100);
  await controller.checkBackup();
  expect(notifications.show).toHaveBeenCalledTimes(1);
  expect(store.reminders?.install?.dismissed).toBe(true);
});
