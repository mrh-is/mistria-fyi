<script lang="ts">
  import CustomPlaceholder from "$lib/components/icon/custom/custom-placeholder.svelte";
  import {
    CATEGORY_ICON,
    COMPLETION_ICON,
    PROGRESS_MARK_ICON,
    RESTRICTION_ICON,
    SEASON_ICON,
    SOURCE_ICON,
    UI_ICON,
    weatherIcon,
  } from "$lib/components/icon/icon-maps.js";

  import type { AppIcon } from "$lib/components/icon/icon-maps.js";
  import type { Season, Weather } from "$lib/types/tracker-data.js";

  const sizes = [16, 24, 32] as const;
  const seasons: Season[] = ["spring", "summer", "fall", "winter"];
  const weathers: Weather[] = ["calm", "inclement", "heavy_inclement", "special"];

  interface IconEntry {
    icon: AppIcon;
    key: string;
  }

  function mapToEntries(record: Record<string, AppIcon>): IconEntry[] {
    return Object.entries(record).map(([key, icon]) => ({ icon, key }));
  }

  const sourceEntries = mapToEntries(SOURCE_ICON);
  const categoryEntries = mapToEntries(CATEGORY_ICON);
  const seasonEntries = mapToEntries(SEASON_ICON);
  const completionEntries = mapToEntries(COMPLETION_ICON);
  const restrictionEntries = mapToEntries(RESTRICTION_ICON);
  const progressMarkEntries = mapToEntries(PROGRESS_MARK_ICON);
  const uiEntries = mapToEntries(UI_ICON);

  const weatherMatrix: { icon: AppIcon; key: string }[] = [];
  for (const season of seasons) {
    for (const weather of weathers) {
      weatherMatrix.push({
        icon: weatherIcon(weather, season),
        key: `${season}/${weather}`,
      });
    }
  }

  // @ts-expect-error custom icon's IconProps index signature is incompatible with Tabler's Icon type
  const placeholderIcon: AppIcon = CustomPlaceholder;
  const customIcons: IconEntry[] = [{ icon: placeholderIcon, key: "placeholder" }];

  let darkMode = $state(false);
</script>

<div class="gallery" class:dark={darkMode}>
  <header class="gallery-header">
    <h1>Icon proof gallery</h1>
    <label class="toggle">
      <input type="checkbox" bind:checked={darkMode} />
      Dark mode
    </label>
  </header>

  <section>
    <h2>Source ({sourceEntries.length})</h2>
    <div class="grid">
      {#each sourceEntries as { icon: IconComp, key } (key)}
        <div class="cell">
          <span class="label">{key}</span>
          <div class="sizes">
            {#each sizes as size (size)}
              <IconComp {size} />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Category ({categoryEntries.length})</h2>
    <div class="grid">
      {#each categoryEntries as { icon: IconComp, key } (key)}
        <div class="cell">
          <span class="label">{key}</span>
          <div class="sizes">
            {#each sizes as size (size)}
              <IconComp {size} />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Season ({seasonEntries.length})</h2>
    <div class="grid">
      {#each seasonEntries as { icon: IconComp, key } (key)}
        <div class="cell">
          <span class="label">{key}</span>
          <div class="sizes">
            {#each sizes as size (size)}
              <IconComp {size} />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Weather ({weatherMatrix.length})</h2>
    <div class="grid-wide grid">
      {#each weatherMatrix as { icon: IconComp, key } (key)}
        <div class="cell">
          <span class="label">{key}</span>
          <div class="sizes">
            {#each sizes as size (size)}
              <IconComp {size} />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Completion ({completionEntries.length})</h2>
    <div class="grid">
      {#each completionEntries as { icon: IconComp, key } (key)}
        <div class="cell">
          <span class="label">{key}</span>
          <div class="sizes">
            {#each sizes as size (size)}
              <IconComp {size} />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Restriction ({restrictionEntries.length})</h2>
    <div class="grid">
      {#each restrictionEntries as { icon: IconComp, key } (key)}
        <div class="cell">
          <span class="label">{key}</span>
          <div class="sizes">
            {#each sizes as size (size)}
              <IconComp {size} />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Progress mark ({progressMarkEntries.length})</h2>
    <div class="grid">
      {#each progressMarkEntries as { icon: IconComp, key } (key)}
        <div class="cell">
          <span class="label">{key}</span>
          <div class="sizes">
            {#each sizes as size (size)}
              <IconComp {size} />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>UI ({uiEntries.length})</h2>
    <div class="grid">
      {#each uiEntries as { icon: IconComp, key } (key)}
        <div class="cell">
          <span class="label">{key}</span>
          <div class="sizes">
            {#each sizes as size (size)}
              <IconComp {size} />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Custom ({customIcons.length})</h2>
    <div class="grid">
      {#each customIcons as { icon: IconComp, key } (key)}
        <div class="cell">
          <span class="label">{key}</span>
          <div class="sizes">
            {#each sizes as size (size)}
              <IconComp {size} />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .gallery {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    font-family: system-ui, sans-serif;
  }

  .gallery.dark {
    background: var(--paper);
    color: var(--ink);
  }

  .gallery-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  h1 {
    font-size: var(--text-2xl);
    font-weight: 600;
  }

  h2 {
    font-size: var(--text-base);
    font-weight: 600;
    margin-bottom: 0.75rem;
    border-bottom: 1px solid currentColor;
    padding-bottom: 0.25rem;
    opacity: 0.7;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--text-sm);
    cursor: pointer;
  }

  section {
    margin-bottom: 2rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.5rem;
  }

  .grid-wide {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }

  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem;
    border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    border-radius: var(--radius-xl);
  }

  .label {
    font-size: var(--text-3xs);
    font-family: monospace;
    opacity: 0.6;
    text-align: center;
    word-break: break-all;
  }

  .sizes {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
</style>
