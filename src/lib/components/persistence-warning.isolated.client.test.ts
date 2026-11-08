import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PersistenceFailureKind } from "#lib/stores/user-state.svelte.js";

const failure = vi.hoisted(() => ({ kind: "unavailable" as PersistenceFailureKind }));
const toastError = vi.hoisted(() => vi.fn(() => "toast-id"));
const downloadProgressBackup = vi.hoisted(() => vi.fn());

vi.mock("svelte-sonner", () => ({ toast: { dismiss: vi.fn(), error: toastError } }));
vi.mock("#lib/controllers/tracking-reminders.svelte.js", () => ({ downloadProgressBackup }));
vi.mock("#lib/stores/user-state.svelte.js", () => ({
  userState: {
    dismissPersistenceWarning: vi.fn(),
    get persistenceFailed() {
      return true;
    },
    get persistenceFailureGeneration() {
      return 1;
    },
    get persistenceFailureKind() {
      return failure.kind;
    },
  },
}));

const { default: PersistenceWarning } = await import("./persistence-warning.svelte");

interface ToastOptions {
  action?: { label: string; onClick: () => void };
  description?: string;
}

async function shownToast(kind: PersistenceFailureKind): Promise<[string, ToastOptions]> {
  failure.kind = kind;
  render(PersistenceWarning);
  await tick();
  expect(toastError).toHaveBeenCalledTimes(1);
  return toastError.mock.calls[0] as unknown as [string, ToastOptions];
}

beforeEach(() => {
  toastError.mockClear();
  downloadProgressBackup.mockClear();
});

describe("PersistenceWarning", () => {
  it("offers a backup right in the toast when a save fails", async () => {
    const [title, options] = await shownToast("unavailable");

    expect(title).toBe("We couldn’t save your last change");
    expect(options.description).toMatch(/^Your browser won’t let the field guide store anything/);
    expect(options.action?.label).toBe("Make a backup");
    options.action?.onClick();
    expect(downloadProgressBackup).toHaveBeenCalledTimes(1);
  });

  it("explains a load the browser refused, with nothing to back up", async () => {
    const [title, options] = await shownToast("load-blocked");

    expect(title).toBe("We can’t reach your saved progress");
    expect(options.description).toMatch(/Nothing has been erased/);
    expect(options.action).toBeUndefined();
  });
});
