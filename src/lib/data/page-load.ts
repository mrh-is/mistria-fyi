import { loadNames } from "#lib/data/names.js";
import { pageMetadata } from "#lib/data/page-metadata.js";
import { localeFromPath } from "#lib/i18n/locale-path.js";
import { getLocale, inLocale } from "#lib/i18n/locale-runtime.js";
import { loadMetadataUi } from "#lib/i18n/metadata-ui.js";

import type { NameChunk } from "#lib/data/names.js";
import type { PageMetadata, PageMetadataInput } from "#lib/data/page-metadata.js";
import type { LocaleCode } from "#lib/types/locale.js";

/** The slice of a SvelteKit page `load` event that {@link localizedPageLoad} reads. */
interface LocalizedPageLoadEvent {
  parent: () => Promise<{ locale: LocaleCode }>;
  url: URL;
}

/**
 * Builds a page `load()` that can fetch its own catalog and names while the root layout loads.
 *
 * `categories` are the name chunks the page renders beyond `ui`, which the root layout already
 * awaits on every route. Both loads must finish before `metadata` calls `getName`.
 */
export function localizedPageLoad(
  categories: readonly NameChunk[],
  metadata: (locale: LocaleCode) => PageMetadataInput,
): (event: LocalizedPageLoadEvent) => Promise<{ metadata: PageMetadata }> {
  return async ({ parent, url }) => {
    const targetLocale = localeFromPath(url.pathname) ?? getLocale();
    const [{ locale }] = await Promise.all([
      parent(),
      loadNames(targetLocale, categories),
      loadMetadataUi(targetLocale),
    ]);
    // Preloading can run while the browser is still on the previous locale.
    return { metadata: inLocale(locale, () => pageMetadata(metadata(locale))) };
  };
}
