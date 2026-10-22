import { fireEvent, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, it } from "vitest";

import SpoilerSection from "#lib/components/spoiler-section.svelte";

const children = createRawSnippet(() => ({
  render: () => `<p data-testid="revealed-section">Revealed section</p>`,
}));

describe("SpoilerSection", () => {
  it("renders the hidden header on the shared section trigger surface", () => {
    const view = render(SpoilerSection, { children, name: "Town Quests", spoilered: true });

    const header = view.container.querySelector("[data-section-trigger]");
    expect(header).toBeInTheDocument();
    expect(header?.tagName).toBe("DIV");
    expect(header).not.toHaveClass("hover:bg-accent/50");
    expect(view.queryByTestId("revealed-section")).not.toBeInTheDocument();
  });

  it("shows no progress on the hidden header", () => {
    const view = render(SpoilerSection, { children, name: "Town Quests", spoilered: true });

    expect(view.queryByTestId("section-progress")).not.toBeInTheDocument();
    expect(view.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
  });

  it("renders the section itself once the spoiler is revealed", async () => {
    const view = render(SpoilerSection, { children, name: "Town Quests", spoilered: true });

    await fireEvent.click(view.getByRole("button"));

    expect(view.getByTestId("revealed-section")).toBeInTheDocument();
    expect(view.container.querySelector("[data-section-trigger]")).not.toBeInTheDocument();
  });

  it("renders the section directly when not spoilered", () => {
    const view = render(SpoilerSection, { children, name: "Town Quests", spoilered: false });

    expect(view.getByTestId("revealed-section")).toBeInTheDocument();
  });
});
