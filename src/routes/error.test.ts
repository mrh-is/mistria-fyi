import { beforeEach, describe, expect, it } from "vitest";

import * as m from "#lib/paraglide/messages.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderToFragmentWithFeedback } from "#lib/test-utils/render-to-fragment-with-feedback.js";

import ErrorPage from "./+error.svelte";

beforeEach(() => {
  pageStub.reset();
  pageStub.status = 404;
});

describe("error page", () => {
  it("renders a friendly 404 page with a link home", () => {
    const { queries, text } = renderToFragmentWithFeedback(ErrorPage, { props: {} });

    expect(queries.getByText("404")).toBeTruthy();
    expect(text).toContain("This page doesn’t exist");
    expect(text).toContain("tend the fields");
    expect(queries.getByRole("link", { name: m.error_back_home() }).getAttribute("href")).toBe(
      "/en",
    );
  });

  it("renders the generic message for non-404 errors", () => {
    pageStub.status = 500;

    const { queries, text } = renderToFragmentWithFeedback(ErrorPage, { props: {} });

    expect(queries.getByText("500")).toBeTruthy();
    expect(text).toContain(m.error_generic());
    expect(text).not.toContain("tend the fields");
  });
});
