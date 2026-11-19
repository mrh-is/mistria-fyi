import type { Attachment } from "svelte/attachments";

const pending = new WeakMap<Element, string>();
let observer: IntersectionObserver | undefined;

/** Like the lazy image, its CSS mask only needs a sprite near the reader. */
export function ledgerSpriteMask(url: string): Attachment<HTMLElement> {
  const mask = `url("${url}")`;
  return (element) => {
    if (typeof IntersectionObserver === "undefined") {
      element.style.setProperty("--sprite-url", mask);
      return () => element.style.removeProperty("--sprite-url");
    }

    observer ??= new IntersectionObserver(
      (entries, activeObserver) => {
        for (const { isIntersecting, target } of entries) {
          if (!isIntersecting || !(target instanceof HTMLElement)) continue;
          const value = pending.get(target);
          if (value !== undefined) target.style.setProperty("--sprite-url", value);
          pending.delete(target);
          activeObserver.unobserve(target);
        }
      },
      { rootMargin: "256px" },
    );
    const activeObserver = observer;
    pending.set(element, mask);
    activeObserver.observe(element);
    return () => {
      pending.delete(element);
      activeObserver.unobserve(element);
      element.style.removeProperty("--sprite-url");
    };
  };
}
