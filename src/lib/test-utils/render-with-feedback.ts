import { render } from "@testing-library/svelte";

import { FeedbackContext } from "#lib/feedback/context.svelte.js";

import Harness from "./feedback-context.test-harness.svelte";

import type { RenderResult } from "@testing-library/svelte";
import type { Component } from "svelte";

/**
 * Renders `component` under the feedback context the root layout provides in the app. Pass a
 * `feedbackContext` to inspect its registrations or picker state; `rerender` keeps the wrapper.
 */
export function renderWithFeedback<Props extends Record<string, unknown>>(
  component: Component<Props>,
  props?: Props,
  feedbackContext = new FeedbackContext(),
): Omit<RenderResult<typeof Harness>, "rerender"> & {
  feedbackContext: FeedbackContext;
  rerender: (next: Partial<Props>) => Promise<void>;
} {
  let current: Record<string, unknown> = props ?? {};
  const view = render(Harness, { component, feedbackContext, innerProps: current } as never);
  return {
    ...view,
    feedbackContext,
    rerender: (next: Partial<Props>) => {
      current = { ...current, ...next };
      return view.rerender({ component, feedbackContext, innerProps: current } as never);
    },
  };
}
