/**
 * Whether save file sync appears at all. `vite.config.ts` defines it from the build environment:
 * off in Cloudflare Pages production builds, on everywhere else (branch previews, dev, & tests).
 * Every sync entry point checks it, so nothing from sync reaches the production site before
 * launch (#291), which removes it.
 */
declare const __SYNC_ENABLED__: boolean;

export const syncEnabled: boolean = __SYNC_ENABLED__;
