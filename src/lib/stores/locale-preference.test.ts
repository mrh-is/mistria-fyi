import { beforeEach, describe, expect, it, vi } from "vitest";

const { setLocale } = vi.hoisted(() => ({ setLocale: vi.fn() }));

vi.mock("$lib/paraglide/runtime.js", () => ({ setLocale }));

import { localePreference } from "./locale-preference.svelte.js";

describe("localePreference", () => {
  beforeEach(() => {
    setLocale.mockReset();
  });

  it("persists a selected locale through Paraglide before navigation", () => {
    localePreference.select("ja");

    expect(setLocale).toHaveBeenCalledWith("ja");
  });
});
