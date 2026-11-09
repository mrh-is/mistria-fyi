<script>
  import { browser } from "$app/env";
  import { resolve } from "$app/paths";

  let { children, data } = $props();

  // Activate before the initial hydration, then before the DOM updates on committed navigation.
  if (browser) data.activateUi?.();
  $effect.pre(() => data.activateUi?.());

  $effect(() => {
    document.documentElement.lang = data.locale;
  });
</script>

<svelte:head><title>Localization spike</title></svelte:head>

<nav aria-label="Locales">
  <a href={resolve("/[locale]/search", { locale: "en" })}>English</a>
  <a href={resolve("/[locale]/search", { locale: "es" })}>Español</a>
  <a href={resolve("/[locale]/search", { locale: "zh-Hant" })}>繁體中文</a>
  <a href={resolve("/[locale]/settings", { locale: "es" })}>Settings fixture</a>
</nav>
{@render children()}
