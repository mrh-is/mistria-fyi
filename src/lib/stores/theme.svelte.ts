import { MediaQuery } from "svelte/reactivity";

import { THEME_COLORS, THEME_STORAGE_KEY } from "#lib/theme.js";
import { safeLocalStorage } from "#lib/utils/local-storage.js";

export type Theme = "dark" | "light" | "system";

function applyTheme(resolved: "dark" | "light") {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  // Update mobile browser chrome color
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", THEME_COLORS[resolved]);
  }
}

function createThemeStore() {
  let preference = $state<Theme>("system");
  // Reactive, so "system" follows the OS theme as it changes.
  const prefersDark = new MediaQuery("(prefers-color-scheme: dark)");

  // Load saved preference
  const stored = safeLocalStorage.getItem(THEME_STORAGE_KEY) as null | Theme;
  if (stored && ["dark", "light", "system"].includes(stored)) {
    preference = stored;
  }

  const resolved = $derived<"dark" | "light">(
    preference === "system" ? (prefersDark.current ? "dark" : "light") : preference,
  );

  // Apply on change, including OS theme changes in "system" mode
  if (typeof window !== "undefined") {
    $effect.root(() => {
      $effect(() => {
        applyTheme(resolved);
        safeLocalStorage.setItem(THEME_STORAGE_KEY, preference);
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
