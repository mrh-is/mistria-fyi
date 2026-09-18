import { sveltekit } from "@sveltejs/kit/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit(), svelteTesting()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.client.test.ts"],
    setupFiles: [
      "./src/vitest-setup.ts",
      "./src/vitest-setup-app-state.ts",
      "./src/vitest-setup-names.ts",
    ],
  },
});
