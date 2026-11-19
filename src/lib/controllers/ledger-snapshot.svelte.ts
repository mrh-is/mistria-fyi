import { onMount, untrack } from "svelte";

import { userState } from "#lib/stores/user-state.svelte.js";

import type { LocaleCode } from "#lib/types/locale.js";

function inputVersion() {
  const { day, season, weather } = userState.state.worldState;
  return JSON.stringify([day, season, weather, userState.state.lastImport, userState.syncReceipt]);
}

/** Capture after hydration, on language changes, and on explicit refresh. */
export function createLedgerSnapshot<T>(
  readLocale: () => LocaleCode,
  build: () => T,
): {
  readonly needsRefresh: boolean;
  readonly ready: boolean;
  refresh: () => void;
  readonly value: T;
} {
  let snapshot = $state.raw(untrack(build));
  let version = $state(untrack(inputVersion));
  // The store preserves this object across check-offs and replaces it for a new progress base.
  let progressBase = $state.raw(untrack(() => userState.state.progress));
  let capturedLocale = untrack(readLocale);
  let ready = $state(false);

  function refresh(): void {
    snapshot = build();
    version = inputVersion();
    progressBase = userState.state.progress;
    capturedLocale = readLocale();
  }

  $effect(() => {
    const locale = readLocale();
    if (ready && locale !== capturedLocale) untrack(refresh);
  });

  onMount(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      refresh();
      ready = true;
    });
    return () => {
      mounted = false;
    };
  });

  return {
    get needsRefresh(): boolean {
      return ready && (version !== inputVersion() || progressBase !== userState.state.progress);
    },
    get ready(): boolean {
      return ready;
    },
    refresh,
    get value(): T {
      return snapshot;
    },
  };
}
