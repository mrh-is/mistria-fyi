<script lang="ts">
  import { onMount } from "svelte";

  import { getName } from "#lib/data/names.js";
  import { LOCALE_CODES } from "#lib/types/locale.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { page } from "$app/state";

  // Real UI strings so each role is judged on what the app actually sets in it.
  const roles = [
    {
      name: "brand",
      note: "always Instrument Serif",
      sample: () => "Mistria Field Guide",
      utility: "font-brand",
    },
    { name: "display", note: "", sample: () => "Welcome, farmer!", utility: "font-display" },
    {
      name: "body",
      note: "",
      sample: () => "Import your Fields of Mistria save to fill in your progress automatically.",
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
      sample: () => "Crops, fish, forage, & more",
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
  const manualSample = "Or start manually to check off the items you begin the game with.";
  const mobileSample =
    "Already tracking on another device? Scan its QR code to bring your progress here.";

  let bodyStack = $state("");
  onMount(() => {
    bodyStack = getComputedStyle(document.documentElement).getPropertyValue("--font-body").trim();
  });
</script>

<div class="flex flex-col gap-6 px-4 py-6">
  <header class="flex flex-col gap-2">
    <h1 class="font-brand text-2xl"><!-- @wc-ignore -->Font specimen</h1>
    <p class="font-annotation text-xs text-muted-foreground">
      {/* @wc-ignore */ `lang=${page.data.locale} · body stack:`}
      <code class="font-data">{bodyStack}</code>
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
      <h2 class="font-controls text-2xs tracking-[0.14em] text-muted-foreground uppercase">
        {role.name}{role.note ? ` · ${role.note}` : ""}
      </h2>
      <p class={[role.utility, "text-2xl"]}>{role.sample()}</p>
      <p class={[role.utility, "text-sm"]}>{role.sample()}</p>
      {#if role.name === "body"}
        <div class="flex flex-col gap-0.5">
          {#each weights as weight (weight)}
            <p class="font-body text-base" style="font-weight: {weight}">
              {weight} · {manualSample}
            </p>
          {/each}
          <p class="font-body text-base italic">
            <!-- @wc-ignore -->italic · {mobileSample}
          </p>
        </div>
      {/if}
    </section>
  {/each}

  <section class="flex flex-col gap-1 border-t pt-3">
    <h2 class="font-controls text-2xs tracking-[0.14em] text-muted-foreground uppercase">
      <!-- @wc-ignore -->composition
    </h2>
    <p class="font-display text-xl">{getName("ui", "villagers", page.data.locale)}</p>
    <p class="font-body text-sm">Friendship & relationships</p>
    <p class="font-annotation text-xs text-muted-foreground">
      {`${getName("ui", "museum", page.data.locale)}, ${12} of ${48} completed`}
    </p>
  </section>
</div>
