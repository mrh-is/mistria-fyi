// The bindings the Cloudflare adapter exposes through `cloudflare:workers`, which replaced
// SvelteKit 2's `event.platform.env`. See https://developers.cloudflare.com/workers/runtime-apis/bindings/
declare module "cloudflare:workers" {
  interface KVNamespace {
    delete: (key: string) => Promise<void>;
    get: (key: string) => Promise<null | string>;
    put: (key: string, value: string, options?: KVNamespacePutOptions) => Promise<void>;
  }

  interface KVNamespacePutOptions {
    expiration?: number;
    expirationTtl?: number;
  }

  export const env: {
    FEEDBACK_EMAIL_STORE: KVNamespace;
    GITHUB_FEEDBACK_TOKEN: string;
    TURNSTILE_SECRET_KEY: string;
  };
}
