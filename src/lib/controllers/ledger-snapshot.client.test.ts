import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { expect, it, vi } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";

import Harness from "./ledger-snapshot.test-harness.svelte";

it("captures once after mounting and rebuilds on a locale change", async () => {
  userState.resetAll();
  const build = vi.fn((locale: string) => [locale]);
  const view = render(Harness, { build, locale: "en" });
  expect(build).not.toHaveBeenCalled();

  await tick();
  expect(build).toHaveBeenCalledExactlyOnceWith("en");
  expect(view.getByTestId("snapshot")).toHaveTextContent("en");
  userState.setSeason("winter");
  await tick();
  expect(view.getByTestId("needs-refresh")).toHaveTextContent("true");
  expect(build).toHaveBeenCalledTimes(1);

  await view.rerender({ locale: "fr" });
  expect(build).toHaveBeenLastCalledWith("fr");
  expect(view.getByTestId("snapshot")).toHaveTextContent("fr");
  expect(view.getByTestId("needs-refresh")).toHaveTextContent("false");
});
