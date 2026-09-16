import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      "**/.worktrees/**",
      "**/.claude/worktrees/**",
      "**/.pnpm-store/**",
    ],
    globalSetup: ["pipeline/src/assets-test-setup.ts"],
    include: ["**/*.assets.test.ts"],
  },
});
