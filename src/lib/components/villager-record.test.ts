import { describe, expect, it } from "vitest";

import VillagerRecordHarness from "#lib/components/villager-record.test-harness.svelte";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

import type { Villager, VillagerId } from "#lib/types/tracker-data.js";

const balor: Villager = { birthday: { day: 10, season: "summer" } };

describe("VillagerRecord SSR", () => {
  it("renders the sprite without an inline event handler the CSP would block", () => {
    const { container } = renderToFragment(VillagerRecordHarness, {
      props: { id: "balor" as VillagerId, name: "Balor", villager: balor },
    });

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image?.hasAttribute("onerror")).toBe(false);
    expect(image?.hasAttribute("onload")).toBe(false);
  });
});
