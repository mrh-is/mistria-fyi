<script>
  import { resolve } from "$app/paths";

  let { children, data } = $props();

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
