import { vi } from "vitest";

export interface HeldTurnstileScripts {
  /** Fails the latest download. */
  fail: () => void;
  /** Finishes the latest download, with the `turnstile` global the real script would define. */
  load: (turnstile: unknown) => void;
  scripts: () => HTMLScriptElement[];
}

/**
 * Keeps Turnstile's `<script>` out of the document, where happy-dom would fail it at once, so a
 * test decides how each download ends. Call inside a test or `beforeEach`.
 */
export function holdTurnstileScripts(): HeldTurnstileScripts {
  const holder = document.createElement("div");
  vi.spyOn(document.head, "append").mockImplementation((...nodes) => {
    holder.append(...nodes);
  });
  const scripts = (): HTMLScriptElement[] => [...holder.querySelectorAll("script")];
  return {
    fail(): void {
      scripts().at(-1)?.dispatchEvent(new Event("error"));
    },
    load(turnstile: unknown): void {
      vi.stubGlobal("turnstile", turnstile);
      scripts().at(-1)?.dispatchEvent(new Event("load"));
    },
    scripts,
  };
}
