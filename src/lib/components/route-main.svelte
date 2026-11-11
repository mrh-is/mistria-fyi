<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";

  import { onNavigate } from "$app/navigation";
  import { page } from "$app/state";

  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();

  const TURN_SHIFT = "--book-turn-shift";

  async function clearTurnShift(finished: Promise<void>): Promise<void> {
    try {
      await finished;
    } catch {
      // A navigation that fails reports itself; the page only needs the shift gone.
    }
    document.documentElement.style.removeProperty(TURN_SHIFT);
  }

  // A page change turns the page (the view-transition styles are in `app.css`). A full load paints
  // with no motion, and so does reduced motion: a plain cut. Query & hash changes on the same page
  // aren't page turns.
  onNavigate((navigation) => {
    if (prefersReducedMotion.current || typeof document.startViewTransition !== "function") return;
    if (navigation.from?.url.pathname === navigation.to?.url.pathname) return;

    const scrollBefore = globalThis.scrollY;
    return new Promise<void>((resolve) => {
      const transition = document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
        // The old snapshot sits where the new page is; shift it back to where it was on screen.
        const shift = `${globalThis.scrollY - scrollBefore}px`;
        document.documentElement.style.setProperty(TURN_SHIFT, shift);
      });
      void clearTurnShift(transition.finished);
    });
  });
</script>

{#key page.url.pathname}
  <main id="main-content" class="flex flex-1 flex-col">
    {@render children()}
  </main>
{/key}
