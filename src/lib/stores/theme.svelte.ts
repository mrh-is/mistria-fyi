import { MediaQuery } from "svelte/reactivity";

import { THEME_COLORS, THEME_STORAGE_KEY } from "#lib/theme.js";
import { tryGetItem, trySetItem } from "#lib/utils/local-storage.js";

export type Theme = "dark" | "light" | "system";

function isTheme(value: null | string): value is Theme {
  return value === "dark" || value === "light" || value === "system";
}

function applyTheme(resolved: "dark" | "light") {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  // Update mobile browser chrome color
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", THEME_COLORS[resolved]);
  }
}

function resolveTheme(preference: Theme, prefersDark: boolean): "dark" | "light" {
  if (preference !== "system") return preference;
  return prefersDark ? "dark" : "light";
}

function createThemeStore() {
  let preference = $state<Theme>("system");
  // Reactive, so "system" follows the OS theme as it changes.
  const prefersDark = new MediaQuery("(prefers-color-scheme: dark)");

  // Load saved preference
  const stored = tryGetItem(THEME_STORAGE_KEY);
  if (stored.ok && isTheme(stored.value)) {
    preference = stored.value;
  }

  const resolved = $derived<"dark" | "light">(resolveTheme(preference, prefersDark.current));

  // Apply on change, including OS theme changes in "system" mode
  if ("window" in globalThis) {
    $effect.root(() => {
      $effect(() => {
        applyTheme(resolved);
        trySetItem(THEME_STORAGE_KEY, preference);
      });
    });
  }

  return {
    cycle() {
      const order: Theme[] = ["system", "light", "dark"];
      const idx = order.indexOf(preference);
      preference = order[(idx + 1) % order.length];
    },
    get preference() {
      return preference;
    },
    get resolved() {
      return resolved;
    },
    set(theme: Theme) {
      preference = theme;
    },
  };
}

export const theme = createThemeStore();
