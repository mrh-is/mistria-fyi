import type { Attachment } from "svelte/attachments";

/**
 * Calls `onError` when the image fails to load, including a failure before hydration. An `onerror`
 * prop would make Svelte SSR an inline `onerror` attribute to replay that early failure, which our
 * nonce CSP blocks (#741); an attachment renders nothing on the server and checks the image's
 * state instead.
 */
export function imageError(onError: () => void): Attachment<HTMLImageElement> {
  return (image) => {
    // A finished load with no pixels is a failure that happened before this attachment ran.
    if (image.complete && image.naturalWidth === 0) {
      onError();
      return undefined;
    }
    image.addEventListener("error", onError, { once: true });
    return () => {
      image.removeEventListener("error", onError);
    };
  };
}
