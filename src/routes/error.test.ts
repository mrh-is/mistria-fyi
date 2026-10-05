import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

import ErrorPage from "./+error.svelte";

const appState = vi.hoisted(() => ({ status: 404 }));

// Under the `app` project's `isolate: false`, a component module cached by this file keeps this
// mock for later files in the same worker, so it carries every field the shared stand-in in
// src/vitest-setup-app-state.ts does.
vi.mock("$app/state", () => ({
  page: {
    data: { locale: "en" },
    get status() {
      return appState.status;
    },
    url: new URL("https://mistria.fyi/en"),
  },
}));

beforeEach(() => {
  appState.status = 404;
});

describe("error page", () => {
  it("renders a friendly 404 page with a link home", () => {
    const { queries, text } = renderToFragment(ErrorPage, { props: {} });

    expect(queries.getByText("404")).toBeTruthy();
    expect(text).toContain("This page doesn't exist");
    expect(text).toContain("tend the fields");
    expect(queries.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/en");
  });

  it("renders the generic message for non-404 errors", () => {
    appState.status = 500;

    const { queries, text } = renderToFragment(ErrorPage, { props: {} });

    expect(queries.getByText("500")).toBeTruthy();
    expect(text).toContain("Something went wrong.");
    expect(text).not.toContain("tend the fields");
  });
});
