/** Cloudflare Turnstile's script, loaded once on first use; feedback & sync share it. */
const TURNSTILE_SCRIPT_TIMEOUT_MS = 10_000;

export function ensureTurnstileScript(): Promise<void> {
  if (globalThis.turnstile) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("Turnstile script load timeout"));
    }, TURNSTILE_SCRIPT_TIMEOUT_MS);

    function waitForGlobal() {
      if (globalThis.turnstile) {
        clearTimeout(timer);
        resolve();
      } else if (!timedOut) {
        setTimeout(waitForGlobal, 50);
      }
    }

    const existing = document.querySelector('script[src*="turnstile"]');
    if (existing) {
      waitForGlobal();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.addEventListener("load", waitForGlobal);
    script.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Turnstile script failed to load"));
    });
    document.head.append(script);
  });
}
