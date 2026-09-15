import type { PageMetadata } from "$lib/data/page-metadata.js";

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

interface KVNamespace {
  delete(key: string): Promise<void>;
  get(key: string): Promise<null | string>;
  put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void>;
}

interface KVNamespacePutOptions {
  expiration?: number;
  expirationTtl?: number;
}

interface Turnstile {
  remove(widgetId: string): void;
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  reset(widgetId: string): void;
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
      metadata: PageMetadata;
    }
    // interface PageState {}
    interface Platform {
      env: {
        FEEDBACK_EMAIL_STORE: KVNamespace;
        GITHUB_FEEDBACK_TOKEN: string;
        TURNSTILE_SECRET_KEY: string;
      };
    }
  }

  interface Window {
    turnstile?: Turnstile;
  }
}

export {};
