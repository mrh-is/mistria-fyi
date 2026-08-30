import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";

import { theme } from "$lib/stores/theme.svelte.js";

import ThemeCard from "./theme-card.svelte";

afterEach(() => {
  theme.set("system");
});

describe("ThemeCard", () => {
  it("starts collapsed with the current preference in its header", () => {
    theme.set("dark");

    const { body } = render(ThemeCard, { props: { open: false } });

    expect(body).toContain('aria-expanded="false"');
    expect(body).toContain("Current preference: Dark");
  });

  it("keeps its controls mounted while collapsed", () => {
    const { body } = render(ThemeCard, { props: { open: false } });

    expect(body).toContain('data-slot="collapsible-content"');
    expect(body).toContain('data-state="closed"');
    expect(body).toContain("System");
    expect(body).toContain("Light");
    expect(body).toContain("Dark");
  });

  it("can be opened programmatically", () => {
    const { body } = render(ThemeCard, { props: { open: true } });

    expect(body).toContain('aria-expanded="true"');
    expect(body).toContain('data-state="open"');
  });

  it("uses phrasing content inside its disclosure button", () => {
    const { body } = render(ThemeCard, { props: { open: false } });
    const trigger = /<button[^>]*data-slot="collapsible-trigger".*?<\/button>/s.exec(body)?.[0];

    expect(trigger).toBeDefined();
    expect(trigger).not.toContain("<div");
    expect(trigger).not.toMatch(/<p(?:\s|>)/);
  });
});
