import type { Attachment } from "svelte/attachments";

const pending = new WeakMap<Element, string>();
let observer: IntersectionObserver | undefined;

/**
 * Loads a sprite's CSS mask once it's near the reader, like the lazy image. The mask's image is
 * decoded before `--sprite-url` is set & `data-mask-ready` appears, because an unloaded mask paints
 * its whole box: the tinted square that flashed while sprites loaded slowly.
 */
export function ledgerSpriteMask(url: string): Attachment<HTMLElement> {
  return (element) => {
    let cancelled = false;
    async function load(target: HTMLElement): Promise<void> {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = url;
      try {
        await image.decode();
      } catch {
        // A sprite that fails to load keeps its plain image, which shows its own broken state.
        return;
      }
      if (cancelled) return;
      target.style.setProperty("--sprite-url", `url("${url}")`);
      target.dataset.maskReady = "";
    }

    if (typeof IntersectionObserver === "undefined") {
      void load(element);
    } else {
      observer ??= new IntersectionObserver(
        (entries, activeObserver) => {
          for (const { isIntersecting, target } of entries) {
            if (!isIntersecting || !(target instanceof HTMLElement)) continue;
            const value = pending.get(target);
            pending.delete(target);
            activeObserver.unobserve(target);
            if (value !== undefined) target.dispatchEvent(new Event("ledger-sprite-near"));
          }
        },
        { rootMargin: "256px" },
      );
      pending.set(element, url);
      element.addEventListener("ledger-sprite-near", () => void load(element), { once: true });
      observer.observe(element);
    }
    return () => {
      cancelled = true;
      pending.delete(element);
      observer?.unobserve(element);
      element.style.removeProperty("--sprite-url");
      delete element.dataset.maskReady;
    };
  };
}
