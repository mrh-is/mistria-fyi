import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import devtoolsJson from "vite-plugin-devtools-json";
import { configDefaults } from "vitest/config";

export default defineConfig({
  build: {
    // tracker-data.json (~838 kB) is inlined into a shared chunk used by every route.
    // Minified: ~885 kB, gzipped transfer: ~108 kB. Lazy-loading isn't viable because the
    // user-state store and engine layer import it synchronously at initialization. The chunk
    // is long-term cached via content-hashed filenames and the service worker.
    chunkSizeWarningLimit: 1000,
  },
  plugins: [tailwindcss(), sveltekit(), devtoolsJson()],
  test: {
    exclude: [...configDefaults.exclude, "**/.worktrees/**", "**/.claude/worktrees/**"],
  },
});
