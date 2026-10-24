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
    /** Absent when the Pages project has no KV binding; callers must handle that. */
    FEEDBACK_EMAIL_STORE?: KVNamespace;
    /** The GitHub App's ID (or client ID). Non-secret; the App is used once all three are set. */
    GITHUB_APP_ID?: string;
    /** The App's installation on this repository. Non-secret. */
    GITHUB_APP_INSTALLATION_ID?: string;
    /** Secret, production only: the App's private key as a PKCS#8 PEM (`BEGIN PRIVATE KEY`). */
    GITHUB_APP_PRIVATE_KEY?: string;
    /** Legacy fine-grained token, used only while the GitHub App is not fully configured. */
    GITHUB_FEEDBACK_TOKEN?: string;
    TURNSTILE_SECRET_KEY: string;
  };
}
