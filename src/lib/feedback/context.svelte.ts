import { createContext, tick } from "svelte";
import { SvelteMap, SvelteSet } from "svelte/reactivity";

import type { Attachment } from "svelte/attachments";

import type { ReportableElement } from "#lib/feedback/types.js";

type SelectionHandler = (element: ReportableElement) => void;

export class FeedbackContext {
  // SvelteSet workaround: $state fields on classes aren't reactive across contexts, but
  // SvelteSet membership checks are. Toggle via clear()/add() instead of direct assignment.
  readonly pickerState = new SvelteSet([false]);
  readonly registrations = new SvelteMap<HTMLElement, ReportableElement>();

  get isPicking(): boolean {
    return this.pickerState.has(true);
  }
  #onFinish: (() => void) | undefined;

  #onSelect: SelectionHandler | undefined;

  cancel(): void {
    this.finish();
  }

  reportable(metadata: ReportableElement): Attachment<HTMLElement> {
    return (element) => {
      this.registrations.set(element, metadata);

      return () => {
        this.registrations.delete(element);
      };
    };
  }

  reset(): void {
    this.#onFinish = undefined;
    this.#onSelect = undefined;
    this.#setPicking(false);
  }

  select(metadata: ReportableElement): void {
    const onSelect = this.#onSelect;
    this.finish();
    onSelect?.(metadata);
  }

  startPicking(onSelect: SelectionHandler, onFinish?: () => void): void {
    this.#onSelect = onSelect;
    this.#onFinish = onFinish;
    this.#setPicking(true);
  }

  #setPicking(value: boolean): void {
    this.pickerState.clear();
    this.pickerState.add(value);
  }

  private finish(): void {
    const onFinish = this.#onFinish;
    this.#onFinish = undefined;
    this.#onSelect = undefined;
    this.#setPicking(false);
    void (async () => {
      await tick();
      onFinish?.();
    })();
  }
}

export const [getFeedbackContext, setFeedbackContext] = createContext<FeedbackContext>();

export function getFeedbackContextOrFallback(): FeedbackContext {
  try {
    return getFeedbackContext();
  } catch {
    return new FeedbackContext();
  }
}
