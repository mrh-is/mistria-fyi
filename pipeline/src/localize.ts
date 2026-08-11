// This explicit compatibility tombstone is absent from main.ts and always throws, including for
// English.

export function localize(_fiddle: unknown, _lang?: string): never {
  if (_lang && _lang !== "en") {
    throw new Error(`Localization for "${_lang}" is not yet supported`);
  }
  throw new Error("localize() should not be called — English strings are inline in TOML data");
}
