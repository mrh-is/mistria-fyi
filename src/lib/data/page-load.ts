import { loadNames } from "#lib/data/names.js";
import { pageMetadata } from "#lib/data/page-metadata.js";

import type { NameChunk } from "#lib/data/names.js";
import type { PageMetadata, PageMetadataInput } from "#lib/data/page-metadata.js";
import type { LocaleCode } from "#lib/types/locale.js";

/** The slice of a SvelteKit page `load` event that {@link localizedPageLoad} reads. */
interface LocalizedPageLoadEvent {
  parent: () => Promise<{ locale: LocaleCode }>;
}

/**
 * Builds a page `load()` that renders in the locale the root layout resolved. Reading the locale
 * from `parent()` rather than the URL is what makes SSR correct: on the server, paraglide's
 * `getLocaleForUrl` ignores the URL and reports the base locale (see `src/routes/+layout.ts`).
 *
 * `categories` are the name chunks the page renders beyond `ui`, which the root layout already
 * awaits on every route. They're loaded before `metadata` runs, so it can call `getName`.
 */
export function localizedPageLoad(
  categories: readonly NameChunk[],
  metadata: (locale: LocaleCode) => PageMetadataInput,
): (event: LocalizedPageLoadEvent) => Promise<{ metadata: PageMetadata }> {
  return async ({ parent }) => {
    const { locale } = await parent();
    await loadNames(locale, categories);
    return { metadata: pageMetadata(metadata(locale)) };
  };
}
