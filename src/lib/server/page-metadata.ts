import type { PageMetadata } from "$lib/data/page-metadata.js";

interface PageModule {
  _pageMetadata?: PageMetadata;
}

const pageModules = import.meta.glob<PageModule>("/src/routes/**/+page.ts", {
  eager: true,
});

export const PAGE_METADATA_ENTRIES = Object.entries(pageModules)
  .flatMap(([modulePath, module]) =>
    module._pageMetadata ? [{ metadata: module._pageMetadata, modulePath }] : [],
  )
  .toSorted(({ metadata: left }, { metadata: right }) => left.path.localeCompare(right.path));

export const PAGE_METADATA = PAGE_METADATA_ENTRIES.map(({ metadata }) => metadata);
