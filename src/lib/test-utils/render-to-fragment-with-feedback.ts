import { FeedbackContext } from "#lib/feedback/context.svelte.js";

import Harness from "./feedback-context.test-harness.svelte";
import { renderToFragment } from "./render-to-fragment.js";

import type { Component } from "svelte";

/** `renderToFragment` under the feedback context the root layout provides in the app. */
export function renderToFragmentWithFeedback<Props extends Record<string, unknown>>(
  component: Component<Props>,
  options: { props?: Props } = {},
): ReturnType<typeof renderToFragment> {
  return renderToFragment(Harness, {
    props: {
      component,
      feedbackContext: new FeedbackContext(),
      innerProps: options.props ?? {},
    } as never,
  });
}
