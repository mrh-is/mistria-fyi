import { fireEvent, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it } from "vitest";

import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

import DataPage from "./+page.svelte";

function trigger(name: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(name) });
}

describe("data management deep links", () => {
  it("opens the tool `?section=` names once the page is in the browser", async () => {
    pageStub.navigate("/en/data?section=transfer");

    renderWithFeedback(DataPage);
    await tick();

    expect(trigger("Transfer to another device")).toHaveAttribute("aria-expanded", "true");
    expect(trigger("Import from save file")).toHaveAttribute("aria-expanded", "false");
    const backupTrigger = trigger("^Backup & restore");
    await fireEvent.click(screen.getByRole("button", { name: "Go to Backup & restore" }));
    expect(backupTrigger).toHaveAttribute("aria-expanded", "true");
    await fireEvent.click(backupTrigger);
    expect(backupTrigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the import tool for `?section=import`", async () => {
    pageStub.navigate("/en/data?section=import");

    renderWithFeedback(DataPage);
    await tick();

    expect(trigger("Import from save file")).toHaveAttribute("aria-expanded", "true");
    expect(trigger("Transfer to another device")).toHaveAttribute("aria-expanded", "false");
  });

  it("leaves every tool closed without a recognized section", async () => {
    pageStub.navigate("/en/data?section=elsewhere");

    renderWithFeedback(DataPage);
    await tick();

    expect(trigger("Import from save file")).toHaveAttribute("aria-expanded", "false");
    expect(trigger("Transfer to another device")).toHaveAttribute("aria-expanded", "false");
  });
});
