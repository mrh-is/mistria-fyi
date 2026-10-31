/**
 * True only in a Cloudflare Pages build of the production branch. `vite.config.ts` defines it from
 * the build environment, so it's fixed per build & prerendered pages agree with the client.
 */
declare const __PRODUCTION_DEPLOYMENT__: boolean;

/**
 * The sync switch: every sync surface checks it, so sync stays hidden on the production site & shows
 * on branch previews until launch (#291), which removes this module & its call sites.
 */
export const syncSwitchOn = !__PRODUCTION_DEPLOYMENT__;
