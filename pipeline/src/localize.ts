// English strings are inline in the TOML data (v1.0.2+).
// This module is retained as a stub for future i18n support.

export function localize(_fiddle: unknown, _lang?: string): never {
  if (_lang && _lang !== "en") {
    throw new Error(`Localization for "${_lang}" is not yet supported`);
  }
  throw new Error("localize() should not be called — English strings are inline in TOML data");
}
