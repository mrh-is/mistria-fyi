import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";

import LeavingSetHarness from "#lib/controllers/leaving-set.test-harness.svelte";

it("clears pending leaving timers when its component unmounts", async () => {
  vi.useFakeTimers();
  const view = render(LeavingSetHarness);
  await fireEvent.click(screen.getByRole("button", { name: "Complete item" }));
  expect(screen.getByText("Leaving")).toBeInTheDocument();
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(1);
  view.unmount();
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(0);
});
