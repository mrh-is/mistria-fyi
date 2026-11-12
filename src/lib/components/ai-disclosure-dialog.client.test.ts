import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import AiDisclosureDialog from "./ai-disclosure-dialog.svelte";

describe("AI disclosure dialog", () => {
  it("places both links inside one sentence", () => {
    render(AiDisclosureDialog, { open: true });

    const repo = screen.getByRole("link", { name: "the GitHub repo" });
    expect(repo).toHaveAttribute("href", "https://github.com/mrh-is/mistria-fyi");
    expect(screen.getByRole("link", { name: "drop me a line" })).toHaveAttribute(
      "href",
      "mailto:michael@mistria.fyi",
    );
    // One message places both links, so the sentence keeps each locale's word order & punctuation.
    expect(repo.closest("p")?.textContent.replaceAll(/\s+/gu, " ").trim()).toMatch(
      /you can check out the GitHub repo, or drop me a line\.$/u,
    );
  });
});
