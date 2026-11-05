/** Cloudflare Turnstile's script, loaded once on first use; feedback & sync share it. */
const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_SCRIPT_TIMEOUT_MS = 10_000;
const GLOBAL_POLL_MS = 50;

/** The download under way, which every caller shares. A failed one leaves nothing behind. */
let loading: Promise<void> | undefined;

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    let poll: ReturnType<typeof setTimeout> | undefined;

    const fail = (message: string): void => {
      clearTimeout(timer);
      clearTimeout(poll);
      // A failed element never loads again, so the next attempt needs a new one.
      script.remove();
      reject(new Error(message));
    };
    const timer = setTimeout(() => {
      fail("Turnstile script load timeout");
    }, TURNSTILE_SCRIPT_TIMEOUT_MS);

    function waitForGlobal(): void {
      if (globalThis.turnstile) {
        clearTimeout(timer);
        resolve();
      } else {
        poll = setTimeout(waitForGlobal, GLOBAL_POLL_MS);
      }
    }

    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", waitForGlobal);
    script.addEventListener("error", () => {
      fail("Turnstile script failed to load");
    });
    document.head.append(script);
  });
}

async function download(): Promise<void> {
  try {
    await loadScript();
  } finally {
    loading = undefined;
  }
}

export function ensureTurnstileScript(): Promise<void> {
  if (globalThis.turnstile) return Promise.resolve();
  loading ??= download();
  return loading;
}
