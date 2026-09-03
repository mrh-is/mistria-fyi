const isBrowser = typeof window !== "undefined";

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
    if (!isBrowser) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
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
