import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import { SOURCE_FILTERS } from "$lib/components/icon/index.js";
import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
import SourceFilterRegistrationHarness from "$lib/utils/source-filter-registration.test-harness.svelte";

afterEach(() => {
  toolbarState.removeSourceFilters("external-test");
  toolbarState.removeSourceFilters("reactivity-test");
});

describe("registerSourceFilters", () => {
  it("does not subscribe its effect to toolbar state read during registration", async () => {
    await expect(
      (async () => {
        render(SourceFilterRegistrationHarness);
        await tick();
        const externalFilter = SOURCE_FILTERS.find(({ label }) => label !== "Gathering");
        expect(externalFilter).toBeDefined();
        if (!externalFilter) return;
        toolbarState.setSourceFilters("external-test", [externalFilter]);
        await tick();
      })(),
    ).resolves.toBeUndefined();
  });
});
