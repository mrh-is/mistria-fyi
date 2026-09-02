import { render } from "svelte/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const appState = vi.hoisted(() => ({ status: 404 }));

vi.mock("$app/state", () => ({
  page: {
    get status() {
      return appState.status;
    },
  },
}));

import ErrorPage from "./+error.svelte";

beforeEach(() => {
  appState.status = 404;
});

describe("error page", () => {
  it("renders a friendly 404 page with a link home", () => {
    const { body, head } = render(ErrorPage, { props: {} });

    expect(head).toContain("<title>404 — Mistria Field Guide</title>");
    expect(body).toContain(">404</span>");
    expect(body).toContain("This page doesn't exist");
    expect(body).toContain("tend the fields");
    expect(body).toContain('href="/"');
    expect(body).toContain("Back to home");
  });

  it("renders the generic message for non-404 errors", () => {
    appState.status = 500;

    const { body, head } = render(ErrorPage, { props: {} });

    expect(head).toContain("<title>500 — Mistria Field Guide</title>");
    expect(body).toContain(">500</span>");
    expect(body).toContain("Something went wrong.");
    expect(body).not.toContain("tend the fields");
  });
});
