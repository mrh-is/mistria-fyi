import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, expect, it, vi } from "vitest";

import { pageStub, updated } from "#lib/test-utils/page-stub.svelte.js";

import UpdatePrompt from "./update-prompt.svelte";

import type * as AppUpdate from "#lib/pwa/app-update.js";

const { reload, toast } = vi.hoisted(() => ({ reload: vi.fn(), toast: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast }));
vi.mock("#lib/pwa/app-update.js", async (importOriginal) => {
  const original = await importOriginal<typeof AppUpdate>();
  return {
    ...original,
    watchForAppUpdate: (options: Parameters<typeof original.watchForAppUpdate>[0]) =>
      original.watchForAppUpdate({ ...options, reload }),
  };
});

afterEach(() => {
  cleanup();
  pageStub.reset();
  vi.unstubAllGlobals();
});

it("offers the uncontrolled-page refresh and keeps dismissal across a remount", async () => {
  vi.stubGlobal("navigator", {});
  render(UpdatePrompt);
  await tick();
  expect(toast).not.toHaveBeenCalled();

  updated.current = true;
  await tick();
  expect(toast).toHaveBeenCalledTimes(1);
  const options = toast.mock.calls[0]?.[1] as {
    action: { label: string; onClick: () => void };
    cancel: { label: string; onClick: () => void };
    duration: number;
    onDismiss: () => void;
  };
  expect(options.action.label).toBe("Refresh");
  expect(options.cancel.label).toBe("Not now");
  expect(options.duration).toBe(Infinity);
  options.action.onClick();
  expect(reload).toHaveBeenCalledTimes(1);
  options.cancel.onClick();
  options.onDismiss();
  cleanup();
  render(UpdatePrompt);
  await tick();
  expect(toast).toHaveBeenCalledTimes(1);
});
