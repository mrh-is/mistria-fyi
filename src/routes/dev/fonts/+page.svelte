<script lang="ts">
  import { onMount } from "svelte";

  import { getName } from "#lib/data/names.js";
  import * as m from "#lib/paraglide/messages.js";
  import { LOCALE_CODES } from "#lib/types/locale.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { page } from "$app/state";

  // Real UI strings so each role is judged on what the app actually sets in it.
  const roles = [
    {
      name: "brand",
      note: "always Instrument Serif",
      sample: () => m.app_name(),
      utility: "font-brand",
    },
    { name: "display", note: "", sample: () => m.onboarding_title(), utility: "font-display" },
    {
      name: "body",
      note: "",
      sample: () => m.onboarding_desktop_description(),
      utility: "font-body",
    },
    {
      name: "controls",
      note: "",
      sample: () => getName("ui", "almanac", page.data.locale),
      utility: "font-controls",
    },
    {
      name: "annotation",
      note: "",
      sample: () => m.category_almanac_description(),
      utility: "font-annotation",
    },
    {
      name: "data",
      note: "digits & Latin",
      sample: () => "1,416 / 5,201 · 27%",
      utility: "font-data",
    },
  ] as const;

  const weights = [400, 500, 600, 700] as const;

  let bodyStack = $state("");
  onMount(() => {
    bodyStack = getComputedStyle(document.documentElement).getPropertyValue("--font-body").trim();
  });
</script>

<div class="flex flex-col gap-6 px-4 py-6">
  <header class="flex flex-col gap-2">
    <h1 class="font-brand text-2xl">Font specimen</h1>
    <p class="font-annotation text-xs text-muted-foreground">
      lang={page.data.locale} · body stack: <code class="font-data">{bodyStack}</code>
    </p>
    <nav class="flex flex-wrap gap-2 font-controls text-xs">
      {#each LOCALE_CODES as locale (locale)}
        <a
          class="rounded border px-2 py-1 {locale === page.data.locale ? 'bg-accent' : ''}"
          href={localizedHref("dev/fonts", { locale })}
        >
          {locale}
        </a>
      {/each}
    </nav>
  </header>

  {#each roles as role (role.name)}
    <section class="flex flex-col gap-1 border-t pt-3">
      <h2 class="font-controls text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        {role.name}{role.note ? ` · ${role.note}` : ""}
      </h2>
      <p class="{role.utility} text-2xl">{role.sample()}</p>
      <p class="{role.utility} text-sm">{role.sample()}</p>
      {#if role.name === "body"}
        <div class="flex flex-col gap-0.5">
          {#each weights as weight (weight)}
            <p class="font-body text-base" style="font-weight: {weight}">
              {weight} · {m.onboarding_manual_description()}
            </p>
          {/each}
          <p class="font-body text-base italic">italic · {m.onboarding_mobile_description()}</p>
        </div>
      {/if}
    </section>
  {/each}

  <section class="flex flex-col gap-1 border-t pt-3">
    <h2 class="font-controls text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
      composition
    </h2>
    <p class="font-display text-xl">{getName("ui", "villagers", page.data.locale)}</p>
    <p class="font-body text-sm">{m.category_villagers_description()}</p>
    <p class="font-annotation text-xs text-muted-foreground">
      {m.section_progress_label({
        completed: 12,
        name: getName("ui", "museum", page.data.locale),
        total: 48,
      })}
    </p>
  </section>
</div>
