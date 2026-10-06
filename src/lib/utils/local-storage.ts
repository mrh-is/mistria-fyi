const isBrowser = "window" in globalThis;

type StorageReadResult = { ok: false } | { ok: true; value: null | string };

/** Attempt to read localStorage while distinguishing a missing key from blocked storage access. */
export function tryGetItem(key: string): StorageReadResult {
  if (!isBrowser) return { ok: false };
  try {
    return { ok: true, value: localStorage.getItem(key) };
  } catch {
    return { ok: false };
  }
}

/**
 * Attempt to write to localStorage, returning whether the write succeeded.
 * Returns false when storage is blocked (private browsing, disabled) or the quota is exceeded.
 */
export function trySetItem(key: string, value: string): boolean {
  if (!isBrowser) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
