/**
 * True only in a Cloudflare Pages build of the production branch. `vite.config.ts` defines it from
 * the build environment, so no request can change it.
 */
declare const __PRODUCTION_DEPLOYMENT__: boolean;

export const isProductionDeployment = __PRODUCTION_DEPLOYMENT__;
