import { sveltekit } from "@sveltejs/kit/vite";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    exclude: [...configDefaults.exclude, "**/.worktrees/**", "**/.claude/worktrees/**"],
    include: ["pipeline/**/*.assets.test.ts"],
  },
});
