import { createContext, tick } from "svelte";

/** The shell's panels, at most one open at a time. */
export type BookPanel = "clock" | "contents" | "feedback" | "settings" | "sync" | "visibility";

/** Names the panels a control opens, as a space-separated list, for focus to fall back on. */
const PANEL_ENTRY_ATTRIBUTE = "data-panel-entry";

/**
 * Which panel the book shell has open, & where focus goes when it closes. The shell creates one per
 * mount, so a locale switch, which remounts the shell, starts with every panel closed.
 *
 * Each control that opens a panel passes itself as the trigger and names its panels with
 * `data-panel-entry`. The rail & the phone's Contents panel are each other's equivalents, and only
 * one shows at a time, so a resize across the book breakpoint can hide the trigger while its panel
 * is open. Closing then focuses a control that shows & opens the same panel, never a hidden one.
 */
export class BookPanels {
  active = $state<BookPanel | null>(null);

  #opener: HTMLElement | null = null;
  readonly #root: () => Document | HTMLElement;

  constructor(root: () => Document | HTMLElement = () => document) {
    this.#root = root;
  }

  /** Closes the open panel; by default, focus returns to its trigger or a visible equivalent. */
  close(restoreFocus = true): void {
    const closing = this.active;
    if (closing === null) return;
    this.active = null;
    const opener = this.#opener;
    this.#opener = null;
    if (!restoreFocus) return;
    void (async () => {
      await tick();
      // Another panel opened in the meantime & has its own focus to set.
      if (this.active !== null) return;
      this.#focusTarget(closing, opener)?.focus();
    })();
  }

  /**
   * Opens `panel`. Opening a panel Contents lists keeps Contents' trigger, since the row you chose
   * unmounts with Contents.
   */
  open(panel: BookPanel, trigger: HTMLElement | null): void {
    if (this.active === panel) return;
    if (this.active !== "contents" || this.#opener === null) this.#opener = trigger;
    this.active = panel;
  }

  /** Opens `panel`, or closes it if it's already open. */
  toggle(panel: BookPanel, trigger: HTMLElement | null): void {
    if (this.active === panel) {
      this.close();
    } else {
      this.open(panel, trigger);
    }
  }

  #focusTarget(panel: BookPanel, opener: HTMLElement | null): HTMLElement | undefined {
    if (opener && isShown(opener)) return opener;
    const entries = this.#root().querySelectorAll<HTMLElement>(`[${PANEL_ENTRY_ATTRIBUTE}]`);
    return [...entries].find(
      (entry) =>
        (entry.getAttribute(PANEL_ENTRY_ATTRIBUTE) ?? "").split(" ").includes(panel) &&
        isShown(entry),
    );
  }
}

function isShown(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest("[inert]")) return false;
  return typeof element.checkVisibility === "function"
    ? element.checkVisibility({ visibilityProperty: true })
    : element.getClientRects().length > 0;
}

export const [getBookPanels, setBookPanels] = createContext<BookPanels>();
