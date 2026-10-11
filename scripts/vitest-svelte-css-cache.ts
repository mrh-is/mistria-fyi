import type { Plugin } from "vite";
import type { CacheKeyIdGeneratorContext } from "vitest/node";

/**
 * Whether Vitest's fs module cache must skip a module: a Svelte component with a `<style>` block.
 *
 * vite-plugin-svelte serves a component's `?svelte&type=style&lang.css` module from the CSS it
 * recorded in plugin metadata while compiling the component in the same server. The fs module cache
 * stores the compiled JavaScript but not that metadata, so a component read from the cache never
 * compiles, and when its CSS module isn't cached too, Vite loads the raw `.svelte` source as CSS
 * and Tailwind fails with `CssSyntaxError: Invalid declaration` (#727). A failed load is never
 * cached, so the mismatch then recurs on every run until the cache is cleared.
 */
export function skipsFsModuleCache({
  id,
  sourceCode,
}: Pick<CacheKeyIdGeneratorContext, "id" | "sourceCode">): boolean {
  return id.endsWith(".svelte") && sourceCode.includes("<style");
}

/** Keeps styled Svelte components out of Vitest's fs module cache; see `skipsFsModuleCache`. */
export function svelteCssCachePlugin(): Plugin {
  return {
    configureVitest({ defineCacheKeyGenerator }) {
      defineCacheKeyGenerator((context) => (skipsFsModuleCache(context) ? false : undefined));
    },
    name: "mistria:svelte-css-cache",
  };
}
