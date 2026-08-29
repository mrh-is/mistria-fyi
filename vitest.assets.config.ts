import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/.worktrees/**", "**/.claude/worktrees/**"],
    globalSetup: ["pipeline/src/assets-test-setup.ts"],
    include: ["**/*.assets.test.ts"],
  },
});
