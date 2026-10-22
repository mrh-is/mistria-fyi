/** The rendered offline page, served by `offlinePagePlugin` (src/lib/build/offline-page.ts). */
declare module "virtual:mfg/offline-page" {
  import type { OfflinePage } from "#lib/pwa/offline-page.js";

  const page: OfflinePage;
  export default page;
}
