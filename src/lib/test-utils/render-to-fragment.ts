import { within } from "@testing-library/svelte";
import { Window } from "happy-dom";
import { render } from "svelte/server";

import type { BoundFunctions, queries } from "@testing-library/svelte";
import type { Component } from "svelte";

/**
 * Server-renders a component and parses its HTML into a detached DOM fragment, so SSR tests can
 * query by role, text, & attribute instead of matching substrings of the raw markup. The app test
 * project runs in plain Node, so the fragment is parsed by a standalone happy-dom window rather
 * than a global `document`.
 *
 * Keep raw `body`/`head` substring checks only where the serialized HTML is the point (for
 * example `<head>` metadata, which has no accessible roles).
 */
export function renderToFragment<Props extends Record<string, unknown>>(
  component: Component<Props>,
  options: { props?: Props } = {},
): {
  /** Parsed `<body>` markup; query it directly (`container.querySelector`). */
  container: HTMLElement;
  /** Raw SSR `body` string, for the rare assertion about serialization itself. */
  html: string;
  /** Testing Library queries (`getByRole`, `getByText`, ...) scoped to the rendered markup. */
  queries: BoundFunctions<typeof queries>;
  /** Visible text with whitespace runs collapsed, for assertions on rendered copy & counters. */
  text: string;
} {
  const { body } = render(component, options as never);
  const window = new Window();
  const container = window.document.createElement("div");
  container.innerHTML = body;
  return {
    container: container as unknown as HTMLElement,
    html: body,
    queries: within(container as unknown as HTMLElement),
    text: container.textContent.replaceAll(/\s+/g, " ").trim(),
  };
}
