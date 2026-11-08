<script lang="ts">
  import CategoryCard from "#lib/components/category-card.svelte";
  import ShelfHeading from "#lib/components/shelf-heading.svelte";
  import { sortCategoryKeysByName } from "#lib/data/categories.js";
  import { CATEGORY_KEYS } from "#lib/engine/categories.js";
  import { progressShelf, SHELVES } from "#lib/engine/shelves.js";
  import * as m from "#lib/paraglide/messages.js";
  import { shelfLabel } from "#lib/presentation/shelves.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { AllProgress } from "#lib/engine/categories.js";

  let { progress }: { progress: AllProgress } = $props();

  // Both groups share number columns so grouped counts fit and every slash stays aligned.
  let countWidth = $derived(
    Math.max(
      4,
      ...CATEGORY_KEYS.flatMap((key) => {
        const { completed, total } = progress[key];
        return [completed, total].map((count) => formatNumber(count, page.data.locale).length);
      }),
    ),
  );

  let shelves = $derived(
    SHELVES.map((shelf) => ({
      keys: sortCategoryKeysByName(
        CATEGORY_KEYS.filter((key) => progressShelf(progress[key]) === shelf),
        page.data.locale,
      ),
      shelf,
    })).filter(({ keys }) => keys.length > 0),
  );
</script>

<!-- Home is the index, so every shelf stays open. -->
<div class="flex flex-col gap-5" style="--category-count-width: {countWidth}ch">
  {#each shelves as { keys, shelf } (shelf)}
    <section class="flex flex-col gap-2" style="--shelf-heading-accent: var(--color-home-accent)">
      <ShelfHeading class="px-1" {shelf} />
      <ul
        class="flex flex-col gap-1.5"
        aria-label={m.shelf_categories_label({ shelf: shelfLabel(shelf) })}
      >
        {#each keys as key (key)}
          <li><CategoryCard {key} progress={progress[key]} quiet={shelf === "notNow"} /></li>
        {/each}
      </ul>
    </section>
  {/each}
</div>
