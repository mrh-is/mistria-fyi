import { getContext, setContext, untrack } from "svelte";
import { SvelteMap, SvelteSet } from "svelte/reactivity";

import { userState } from "#lib/stores/user-state.svelte.js";
import { captureFocusFallback } from "#lib/utils/focus-fallback.js";
import { ROW_LEAVE_MS } from "#lib/utils/row-timing.js";

interface CompletionScope {
  completed: boolean;
  sections: SvelteMap<symbol, boolean>;
}

const COMPLETION_SCOPE = Symbol("completion-scope");
const SHARED_REVEALS = Symbol("shared-reveals");

/** Everything partitions whole sections, using the same completion their headers display. */
export function createCompletionScope(completed: boolean): {
  hasContent: (fallback: boolean) => boolean;
} {
  const scope: CompletionScope = { completed, sections: new SvelteMap() };
  setContext(COMPLETION_SCOPE, scope);
  return {
    hasContent: (fallback) =>
      scope.sections.size === 0 ? fallback : [...scope.sections.values()].some(Boolean),
  };
}

/**
 * Everything renders each category twice, so revealing a masked section has to reach both copies.
 * Otherwise a revealed section that's finished would hide in one copy & stay masked in the other.
 */
export function createSharedReveals(): void {
  setContext(SHARED_REVEALS, new SvelteSet<string>());
}

export function getSharedReveals(): SvelteSet<string> | undefined {
  return getContext<SvelteSet<string> | undefined>(SHARED_REVEALS);
}

export function getCompletionScope(): CompletionScope | undefined {
  return getContext<CompletionScope | undefined>(COMPLETION_SCOPE);
}

/**
 * Registers even while a category is collapsed, so progress edits can reveal or remove it. A section
 * changes lists once a completed row has had time to leave. Both copies wait the same time, so it
 * never shows in both lists, and focus inside it moves to a trigger that's still on the page.
 */
export function registerCompletionSection(
  complete: () => boolean,
  enabled: () => boolean = () => true,
): { readonly visible: boolean } {
  const scope = getCompletionScope();
  const key = Symbol("section");
  let settledComplete = $state(untrack(complete));
  let lastProgress = untrack(() => userState.state.progress);
  let visible = $derived(!scope || !enabled() || scope.completed === settledComplete);
  let wasVisible = untrack(() => visible);
  let restoreFocus: (() => Promise<void>) | undefined;
  $effect(() => {
    if (!scope) return;
    const next = complete();
    const progress = userState.state.progress;
    // Loaded or restored progress replaces the whole object. Nobody toggled anything, so nothing waits.
    if (progress !== lastProgress) {
      lastProgress = progress;
      settledComplete = next;
      return;
    }
    if (next === untrack(() => settledComplete)) return;
    const timer = setTimeout(() => {
      settledComplete = next;
    }, ROW_LEAVE_MS);
    return () => {
      clearTimeout(timer);
    };
  });
  $effect.pre(() => {
    if (wasVisible && !visible) restoreFocus = captureFocusFallback();
    wasVisible = visible;
  });
  $effect(() => {
    void visible;
    const restore = restoreFocus;
    restoreFocus = undefined;
    if (restore) void restore();
  });
  $effect(() => {
    if (!scope || !enabled()) return;
    const matches = visible;
    untrack(() => scope.sections.set(key, matches));
    return () => {
      scope.sections.delete(key);
    };
  });
  return {
    get visible() {
      return visible;
    },
  };
}
