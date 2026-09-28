import { render } from "svelte/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import ErrorPage from "./+error.svelte";

beforeEach(() => {
  appState.status = 404;
});

describe("error page", () => {
  it("renders a friendly 404 page with a link home", () => {
    const { body } = render(ErrorPage, { props: {} });

    expect(body).toContain(">404</span>");
    expect(body).toContain("This page doesn't exist");
    expect(body).toContain("tend the fields");
    expect(body).toContain('href="/en"');
    expect(body).toContain("Back to home");
  });

  it("renders the generic message for non-404 errors", () => {
    appState.status = 500;

    const { body } = render(ErrorPage, { props: {} });

    expect(body).toContain(">500</span>");
    expect(body).toContain("Something went wrong.");
    expect(body).not.toContain("tend the fields");
  });
});
