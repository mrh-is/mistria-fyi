import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as m from "#lib/paraglide/messages.js";

import type { PersistenceFailureKind } from "#lib/stores/user-state.svelte.js";

const failure = vi.hoisted(() => ({ kind: "unavailable" as PersistenceFailureKind }));
const toastError = vi.hoisted(() => vi.fn(() => "toast-id"));
const downloadJson = vi.hoisted(() => vi.fn());
const dismissPersistenceWarning = vi.hoisted(() => vi.fn());

vi.mock("svelte-sonner", () => ({ toast: { dismiss: vi.fn(), error: toastError } }));
vi.mock("#lib/utils/download.js", () => ({ BACKUP_FILE_PREFIX: "backup", downloadJson }));
vi.mock("#lib/stores/user-state.svelte.js", () => ({
  userState: {
    dismissPersistenceWarning,
    exportBackup: () => '{"in":"memory"}',
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
  downloadJson.mockClear();
  dismissPersistenceWarning.mockClear();
});

describe("PersistenceWarning", () => {
  it("offers a backup right in the toast when a save fails", async () => {
    const [title, options] = await shownToast("unavailable");

    expect(title).toBe(m.persistence_warning_title());
    expect(options.description).toMatch(m.persistence_warning());
    expect(options.action?.label).toBe(m.persistence_warning_backup());
    options.action?.onClick();
    // The in-memory export, without the reminder bookkeeping whose storage write would fail again.
    expect(downloadJson).toHaveBeenCalledExactlyOnceWith('{"in":"memory"}', "backup");
    // Sonner skips onDismiss for an action, so the action itself has to count as dismissing.
    expect(dismissPersistenceWarning).toHaveBeenCalledTimes(1);
  });

  it("explains a load the browser refused, with nothing to back up", async () => {
    const [title, options] = await shownToast("load-blocked");

    expect(title).toBe(m.persistence_warning_load_title());
    expect(options.description).toMatch(m.persistence_warning_load());
    expect(options.action).toBeUndefined();
  });
});
