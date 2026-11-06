import { cleanup, setup } from "@testing-library/svelte";
import { flushSync, tick } from "svelte";
import { aroundEach, beforeAll, vi } from "vitest";

import { resetRowReveal } from "#lib/controllers/row-reveal.svelte.js";
import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { updateHolds } from "#lib/pwa/update-holds.js";
import { theme } from "#lib/stores/theme.svelte.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { syncNotice } from "#lib/sync/notice.svelte.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { toastState } from "#lib/test-utils/sonner-state.js";

const originalGetLocale = getLocale;

function resetSharedState(): void {
  resetRowReveal();
  toastState.reset();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();

  // Clear failed, quarantined, or newer data before resetting the store. Clear again after its
  // effects flush so neither the reset's own writes nor an old debounced save survive the test.
  localStorage.clear();
  userState.loadFromStorage();
  userState.resetAll();
  toolbarState.reset();
  pageStub.reset();
  syncNotice.dismiss();
  theme.set("system");
  overwriteGetLocale(originalGetLocale);
  flushSync();
  localStorage.clear();
  sessionStorage.clear();
  document.body.replaceChildren();
  document.documentElement.classList.remove("dark");
  document.querySelector('meta[name="theme-color"]')?.remove();

  // Save import & backup restore release their reload holds when unmounted.
  if (updateHolds.held) throw new Error("A client test left an app update hold active");
}

// Store initialization can write defaults before the first test on a fresh worker.
beforeAll(resetSharedState);

// The outer hook runs even if a test fails. Unmount with the test's stubs still installed so
// component teardown cancels its own timers, listeners, and frames through the same APIs it used.
aroundEach(async (runTest) => {
  await setup();
  try {
    await runTest();
  } finally {
    try {
      await tick();
    } finally {
      try {
        cleanup();
      } finally {
        resetSharedState();
      }
    }
  }
});
