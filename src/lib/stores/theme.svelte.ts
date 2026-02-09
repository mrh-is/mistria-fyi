export type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "harvest-helper-theme";

function applyTheme(resolved: "dark" | "light") {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  // Update mobile browser chrome color
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", resolved === "dark" ? "#1a1a2e" : "#ffffff");
  }
}

function createThemeStore() {
  let preference = $state<Theme>("system");

  // Load saved preference
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY) as null | Theme;
    if (stored && ["dark", "light", "system"].includes(stored)) {
      preference = stored;
    }
  }

  const resolved = $derived<"dark" | "light">(
    preference === "system" ? getSystemTheme() : preference,
  );

  // Apply on change + listen for system theme changes
  if (typeof window !== "undefined") {
    $effect.root(() => {
      $effect(() => {
        applyTheme(resolved);
        localStorage.setItem(STORAGE_KEY, preference);
      });
    });

    // React to OS theme changes when in "system" mode
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (preference === "system") {
        applyTheme(getSystemTheme());
      }
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

function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const theme = createThemeStore();
