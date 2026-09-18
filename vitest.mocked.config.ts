import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    // These files use vi.mock() on shared packages (canvas-confetti, svelte-sonner) or reset the
    // module registry to observe `names.js` from a cold start. With the root config's
    // `isolate: false`, a module cached unmocked by another file in the same worker can win the
    // race and leave the mock unapplied, and a reset registry would hand later files an unloaded
    // name cache, so they need real isolation. This config deliberately has no
    // `vitest-setup-names.ts`: the names tests load exactly the chunks they mean to test.
    include: [
      "src/lib/data/names.fallback.test.ts",
      "src/lib/data/names.loading.test.ts",
      "src/lib/utils/celebrate.test.ts",
      "src/lib/utils/undo-toast.test.ts",
    ],
  },
});
