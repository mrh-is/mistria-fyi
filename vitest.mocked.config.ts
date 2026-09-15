import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    // These files use vi.mock() on shared packages (canvas-confetti, svelte-sonner). With the
    // root config's `isolate: false`, a module cached unmocked by another file in the same
    // worker can win the race and leave the mock unapplied, so they need real isolation.
    include: ["src/lib/utils/celebrate.test.ts", "src/lib/utils/undo-toast.test.ts"],
  },
});
