import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { fromStore, writable } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

import type { PersistenceFailureKind } from "#lib/stores/user-state.svelte.js";

const failure = vi.hoisted(() => ({ kind: "unavailable" as PersistenceFailureKind }));
const toastError = vi.hoisted(() => vi.fn(() => "toast-id"));
const toastDismiss = vi.hoisted(() => vi.fn());
const downloadJson = vi.hoisted(() => vi.fn());
const dismissPersistenceWarning = vi.hoisted(() => vi.fn());
const generationStore = writable(1);
const generation = fromStore(generationStore);

vi.mock("svelte-sonner", () => ({ toast: { dismiss: toastDismiss, error: toastError } }));
vi.mock("#lib/utils/download.js", () => ({ BACKUP_FILE_PREFIX: "backup", downloadJson }));
vi.mock("#lib/stores/user-state.svelte.js", () => ({
  userState: {
    dismissPersistenceWarning,
    exportBackup: () => '{"in":"memory"}',
    get persistenceFailed() {
      return true;
    },
    get persistenceFailureGeneration() {
      return generation.current;
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
  id?: number | string;
  onDismiss?: () => void;
}

async function shownToast(kind: PersistenceFailureKind): Promise<[string, ToastOptions]> {
  failure.kind = kind;
  render(PersistenceWarning);
  await tick();
  expect(toastError).toHaveBeenCalledTimes(1);
  return toastError.mock.calls[0] as unknown as [string, ToastOptions];
}

beforeEach(() => {
  pageStub.reset();
  generationStore.set(1);
  toastError.mockClear();
  toastDismiss.mockClear();
  downloadJson.mockClear();
  dismissPersistenceWarning.mockClear();
});

describe("PersistenceWarning", () => {
  it("offers a backup right in the toast when a save fails", async () => {
    const [title, options] = await shownToast("unavailable");

    expect(title).toBe("We couldn’t save your last change");
    expect(options.description).toMatch(
      "Your browser won’t let the field guide store anything. Check your settings to make sure storage isn’t full or turned off. For now, make a backup so you don’t lose your changes.",
    );
    expect(options.action?.label).toBe("Make a backup");
    options.action?.onClick();
    // The in-memory export, without the reminder bookkeeping whose storage write would fail again.
    expect(downloadJson).toHaveBeenCalledExactlyOnceWith('{"in":"memory"}', "backup");
    // Sonner skips onDismiss for an action, so the action itself has to count as dismissing.
    expect(dismissPersistenceWarning).toHaveBeenCalledTimes(1);
  });

  it("translates an active save warning in place when the locale changes", async () => {
    await shownToast("unavailable");

    pageStub.data.locale = "es";
    await tick();

    expect(toastDismiss).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(2);
    const [title, options] = toastError.mock.lastCall as unknown as [string, ToastOptions];
    expect(title).toBe("No hemos podido guardar tu último cambio");
    expect(options.id).toBe("toast-id");
    expect(options.action?.label).toBe("Hacer una copia");
    expect(dismissPersistenceWarning).not.toHaveBeenCalled();
  });

  it("announces another failed save without letting the old toast clear the warning", async () => {
    const [, first] = await shownToast("unavailable");
    toastError.mockReturnValueOnce("second-toast-id");

    generationStore.set(2);
    await tick();

    expect(toastDismiss).toHaveBeenCalledExactlyOnceWith("toast-id");
    expect(toastError).toHaveBeenCalledTimes(2);
    const [title, second] = toastError.mock.lastCall as unknown as [string, ToastOptions];
    expect(title).toBe("We couldn’t save your last change");
    expect(second.id).toBeUndefined();

    first.onDismiss?.();
    expect(dismissPersistenceWarning).not.toHaveBeenCalled();
    second.onDismiss?.();
    expect(dismissPersistenceWarning).toHaveBeenCalledTimes(1);
  });

  it.each<PersistenceFailureKind>(["load-blocked", "newer-data", "unreadable"])(
    "leaves %s, which blocks every edit, to the page's notice instead of a toast",
    async (kind) => {
      failure.kind = kind;
      render(PersistenceWarning);
      await tick();
      expect(toastError).not.toHaveBeenCalled();
    },
  );
});
