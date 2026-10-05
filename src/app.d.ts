import type { PageMetadata } from "#lib/data/page-metadata.js";
import type { LocaleCode } from "#lib/types/locale.js";

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

interface Turnstile {
  remove: (widgetId: string) => void;
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
}

interface TurnstileRenderOptions {
  "before-interactive-callback"?: () => void;
  callback?: (token: string) => void;
  "error-callback"?: (errorCode: string) => void;
  "expired-callback"?: () => void;
  sitekey: string;
  theme?: "auto" | "dark" | "light";
}

declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    interface PageData {
      locale: LocaleCode;
      metadata: PageMetadata;
    }
    // interface PageState {}
  }

  interface Window {
    turnstile?: Turnstile;
  }

  var turnstile: Turnstile | undefined;
}
