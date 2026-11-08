import { createContext } from "svelte";

export const [getNavigationHistory, setNavigationHistory] = createContext<NavigationHistory>();

interface NavigationHistory {
  canGoBack: () => boolean;
  start: () => () => void;
}

/** Each document starts a new boundary, so direct entry never borrows external history. */
export function createNavigationHistory(): NavigationHistory {
  let depth = 0;
  return {
    start(): () => void {
      const session = crypto.randomUUID();
      const key = "mistriaNavigation";
      const pushState = history.pushState.bind(history);
      const replaceState = history.replaceState.bind(history);
      function stamp(data: unknown, position: number): Record<string, unknown> {
        return {
          ...(typeof data === "object" && data !== null ? data : {}),
          [key]: { depth: position, session },
        };
      }
      function restore(event: PopStateEvent): void {
        const data: unknown = event.state;
        const marker =
          typeof data === "object" && data !== null && key in data
            ? (data as Record<string, unknown>)[key]
            : undefined;
        depth =
          typeof marker === "object" &&
          marker !== null &&
          "session" in marker &&
          marker.session === session &&
          "depth" in marker &&
          typeof marker.depth === "number"
            ? marker.depth
            : 0;
      }
      // Preserve SvelteKit’s state while marking pushes & replacements through public browser APIs.
      history.pushState = (data: unknown, unused: string, url?: null | string | URL): void => {
        pushState(stamp(data, depth + 1), unused, url);
        depth += 1;
      };
      history.replaceState = (data: unknown, unused: string, url?: null | string | URL): void => {
        replaceState(stamp(data, depth), unused, url);
      };
      replaceState(stamp(history.state, depth), "");
      globalThis.addEventListener("popstate", restore);
      return () => {
        history.pushState = pushState;
        history.replaceState = replaceState;
        globalThis.removeEventListener("popstate", restore);
      };
    },
    canGoBack: (): boolean => depth > 0,
  };
}
