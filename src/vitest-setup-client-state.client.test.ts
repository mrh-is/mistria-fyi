import { toast } from "svelte-sonner";
import { describe, expect, it, vi } from "vitest";

import { trackingReminders } from "#lib/controllers/tracking-reminders.svelte.js";
import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { PROGRESS_STORAGE_KEY } from "#lib/stores/storage-keys.js";
import { theme } from "#lib/stores/theme.svelte.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { syncNotice } from "#lib/sync/notice.svelte.js";
import { pageStub, updated } from "#lib/test-utils/page-stub.svelte.js";
import { toastState } from "#lib/test-utils/sonner-state.js";

describe("shared client setup", { shuffle: false }, () => {
  it("leaves state for the shared teardown to reset", async () => {
    expect.soft(localStorage).toHaveLength(0);
    expect.soft(sessionStorage).toHaveLength(0);
    toolbarState.openSearch();
    toolbarState.setSearchQuery("turnip");
    toolbarState.carrySearchToNextPage();
    toolbarState.registerPageSearch(Symbol("test search counter"), () => ({
      filtered: { completed: 0, notNow: 0, todo: 0 },
      visible: 1,
    }));
    toolbarState.registerSourceFilters("almanac", []);
    toolbarState.showUnobtainable = true;
    toolbarState.toggleFilterSection("sources");
    toolbarState.panelClearance = 42;
    vi.stubGlobal("navigator", { maxTouchPoints: 5, platform: "iPhone", userAgent: "iPhone" });
    await userState.startTrackingByHand();
    await trackingReminders.checkInstall("lane-chosen");
    expect(trackingReminders.installOpen).toBe(true);
    userState.setRenown(7);
    userState.toggleShowSpoilers();
    localStorage.setItem(PROGRESS_STORAGE_KEY, "{invalid");
    userState.loadFromStorage();
    expect(userState.unreadableData).toBe("{invalid");
    pageStub.navigate("/ja/almanac");
    pageStub.data = { locale: "ja" };
    pageStub.status = 404;
    updated.current = true;
    theme.set("dark");
    syncNotice.show(42);
    const toastId = toast("Test notification", { onDismiss: vi.fn() });
    toast.dismiss(toastId);
    expect(toastState.toasts.map(({ id }) => id)).toContain(toastId);
    overwriteGetLocale(() => "ja");
    document.body.append(document.createElement("div"));
    localStorage.setItem("test-key", "test-value");
    sessionStorage.setItem("test-key", "test-value");
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn());
  });

  it("starts the next test from defaults", () => {
    expect.soft(toolbarState.searchOpen).toBe(false);
    expect.soft(toolbarState.searchQuery).toBe("");
    expect.soft(toolbarState.pageSearchCount.visible).toBe(0);
    expect.soft(toolbarState.hasAlmanacFilters).toBe(false);
    expect.soft(toolbarState.showUnobtainable).toBe(false);
    expect.soft(toolbarState.expandedFilterSections.size).toBe(0);
    expect.soft(toolbarState.panelClearance).toBe(0);
    toolbarState.openSearch();
    toolbarState.finishSearchAfterNavigation();
    expect.soft(toolbarState.searchOpen).toBe(false);
    expect.soft(userState.state.progress.renown).toBe(0);
    expect.soft(userState.state.showSpoilers).toBe(false);
    expect.soft(userState.unreadableData).toBeNull();
    expect.soft(userState.persistenceFailed).toBe(false);
    expect.soft(pageStub.url.pathname).toBe("/en");
    expect.soft(pageStub.data.locale).toBe("en");
    expect.soft(pageStub.status).toBe(200);
    expect.soft(updated.current).toBe(false);
    expect.soft(theme.preference).toBe("system");
    expect.soft(syncNotice.applied).toBeNull();
    expect.soft(toastState.toasts).toHaveLength(0);
    expect.soft(trackingReminders.installOpen).toBe(false);
    expect.soft(getLocale()).toBe("en");
    expect.soft(document.documentElement.classList.contains("dark")).toBe(false);
    expect.soft(document.body.childElementCount).toBe(0);
    expect.soft(localStorage).toHaveLength(0);
    expect.soft(sessionStorage.getItem("test-key")).toBeNull();
    expect.soft(vi.isFakeTimers()).toBe(false);
    expect.soft(matchMedia("(prefers-color-scheme: dark)")).toMatchObject({ matches: false });
  });
});
