import { getContext, setContext, untrack } from "svelte";
import { SvelteMap } from "svelte/reactivity";

interface CompletionScope {
  completed: boolean;
  sections: SvelteMap<symbol, boolean>;
}

const COMPLETION_SCOPE = Symbol("completion-scope");

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

export function getCompletionScope(): CompletionScope | undefined {
  return getContext<CompletionScope | undefined>(COMPLETION_SCOPE);
}

/** Registers even while a category is collapsed, so progress edits can reveal or remove it. */
export function registerCompletionSection(
  complete: () => boolean,
  enabled: () => boolean = () => true,
): { readonly visible: boolean } {
  const scope = getCompletionScope();
  const key = Symbol("section");
  let visible = $derived(!scope || !enabled() || scope.completed === complete());
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
