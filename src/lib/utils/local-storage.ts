const isBrowser = typeof window !== "undefined";

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

export const safeLocalStorage: Storage = {
  clear: () => {
    if (!isBrowser) return;
    try {
      localStorage.clear();
    } catch {
      // Blocked — silently ignore
    }
  },
  getItem: (key: string): null | string => {
    const result = tryGetItem(key);
    return result.ok ? result.value : null;
  },
  key: (index: number): null | string => {
    if (!isBrowser) return null;
    try {
      return localStorage.key(index);
    } catch {
      return null;
    }
  },
  get length(): number {
    if (!isBrowser) return 0;
    try {
      return localStorage.length;
    } catch {
      return 0;
    }
  },
  removeItem: (key: string) => {
    if (!isBrowser) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Blocked — silently ignore
    }
  },
  setItem: (key: string, value: string) => {
    if (!isBrowser) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage full or blocked — caller can detect via trySetItem
    }
  },
};
