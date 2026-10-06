import { createContext, tick } from "svelte";
import { SvelteMap } from "svelte/reactivity";

import type { Attachment } from "svelte/attachments";

import type { ReportTarget } from "#lib/feedback/types.js";

type SelectionHandler = (element: ReportTarget) => void;

/**
 * Tracks which elements can be reported & whether the picker is choosing one. The root layout
 * creates one and provides it with `setFeedbackContext`; consumers read it with
 * `getFeedbackContext()`, which throws outside a provider rather than handing back a context
 * nothing else can see.
 */
export class FeedbackContext {
  isPicking = $state(false);
  readonly registrations = new SvelteMap<HTMLElement, ReportTarget>();

  #onFinish: (() => void) | undefined;
  #onSelect: SelectionHandler | undefined;

  cancel(): void {
    this.#finish();
  }

  reportableAttachment(metadata: ReportTarget): Attachment<HTMLElement> {
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
    this.isPicking = false;
  }

  select(metadata: ReportTarget): void {
    const onSelect = this.#onSelect;
    this.#finish();
    onSelect?.(metadata);
  }

  startPicking(onSelect: SelectionHandler, onFinish?: () => void): void {
    this.#onSelect = onSelect;
    this.#onFinish = onFinish;
    this.isPicking = true;
  }

  #finish(): void {
    const onFinish = this.#onFinish;
    this.reset();
    void (async () => {
      await tick();
      onFinish?.();
    })();
  }
}

export const [getFeedbackContext, setFeedbackContext] = createContext<FeedbackContext>();
