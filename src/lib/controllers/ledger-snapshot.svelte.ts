import { onMount, untrack } from "svelte";

import { userState } from "#lib/stores/user-state.svelte.js";

function inputVersion() {
  const { day, season, weather } = userState.state.worldState;
  return JSON.stringify([day, season, weather, userState.state.lastImport, userState.syncReceipt]);
}

/** Capture after the root loads stored progress, then only on an explicit refresh. */
export function createLedgerSnapshot<T>(build: () => T): {
  readonly needsRefresh: boolean;
  readonly ready: boolean;
  refresh: () => void;
  readonly value: T;
} {
  let snapshot = $state.raw(untrack(build));
  let version = $state(untrack(inputVersion));
  let ready = $state(false);

  function refresh(): void {
    snapshot = build();
    version = inputVersion();
  }

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
      return ready && version !== inputVersion();
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
