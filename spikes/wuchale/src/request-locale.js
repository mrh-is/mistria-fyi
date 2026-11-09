import { resolveLocale } from "./locale.js";

/** @typedef {(event: { params: { locale?: string } }, options: {transformPageChunk: (chunk: {html: string}) => string}) => Promise<Response>} Resolve */

/** @param {{ params: { locale?: string } }} event @param {Resolve} resolve */
export function localizeRequest(event, resolve) {
  const locale = resolveLocale(event.params.locale);
  return {
    locale,
    render: () =>
      resolve(event, {
        transformPageChunk: ({ html }) =>
          html.replace('<html lang="en">', `<html lang="${locale}">`),
      }),
  };
}
