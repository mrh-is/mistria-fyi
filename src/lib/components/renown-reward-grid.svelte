<script lang="ts">
  import IconArchive from "@tabler/icons-svelte-runes/icons/archive";
  import IconCoins from "@tabler/icons-svelte-runes/icons/coins";
  import IconShirt from "@tabler/icons-svelte-runes/icons/shirt";
  import { onMount, tick } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import RenownPole from "#lib/components/renown-pole.svelte";
  import { itemSpriteUrl } from "#lib/sprites/sprite-url.js";

  import type { RenownRewardDisplay } from "#lib/presentation/renown-rewards-messages.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  let {
    level,
    locale,
    rewards,
  }: {
    level: number;
    locale: LocaleCode;
    rewards: RenownRewardDisplay[];
  } = $props();

  const phone = new MediaQuery("max-width: 47.99rem", false);
  const id = $props.id();
  let mounted = $state(false);
  let columns = $derived(mounted && phone.current ? 5 : 10);
  let selected = $state(1);
  let reward = $derived(rewards[selected - 1]);
  let rows = $derived(
    Array.from({ length: Math.ceil(rewards.length / columns) }, (_, index) => {
      const start = index * columns;
      return rewards.slice(start, start + columns);
    }).toReversed(),
  );

  // Keep the server's row structure through hydration. A phone then splits each rank in two.
  onMount(() => {
    mounted = true;
  });

  async function move(event: KeyboardEvent, current: number): Promise<void> {
    const first = Math.floor((current - 1) / columns) * columns + 1;
    const destinations: Partial<Record<string, number>> = {
      ArrowDown: current - columns,
      ArrowLeft: current - 1,
      ArrowRight: current + 1,
      ArrowUp: current + columns,
      End: event.ctrlKey ? rewards.length : Math.min(first + columns - 1, rewards.length),
      Home: event.ctrlKey ? 1 : first,
    };
    const next = destinations[event.key];
    if (typeof next !== "number" || event.altKey || event.metaKey) return;
    event.preventDefault();
    if (next < 1 || next > rewards.length) return;
    selected = next;
    await tick();
    document.getElementById(`${id}-reward-${next}`)?.focus();
  }
</script>

<div class="reward-chart">
  <RenownPole {locale} />
  <div class="reward-grid" role="grid" aria-label="Renown rewards" style:--reward-columns={columns}>
    {#each rows as row (row[0].level)}
      <div class="reward-row" role="row">
        {#each row as cell (cell.level)}
          <div
            class="reward-cell"
            role="gridcell"
            id={`${id}-reward-${cell.level}`}
            tabindex={selected === cell.level ? 0 : -1}
            aria-selected={selected === cell.level}
            aria-label={cell.label}
            aria-describedby={cell.level <= level ? `${id}-reached` : `${id}-unreached`}
            data-reached={cell.level <= level}
            onclick={() => (selected = cell.level)}
            onkeydown={(event) => void move(event, cell.level)}
          >
            <span
              class="reward-icon"
              data-sprite-treatment={cell.level <= level ? "completed" : "not-now"}
              aria-hidden="true"
            >
              {#if cell.sprite}
                <img
                  src={itemSpriteUrl(cell.sprite)}
                  alt=""
                  crossorigin="anonymous"
                  width="28"
                  height="28"
                  loading="lazy"
                />
              {:else if cell.amount}
                <IconCoins size={20} />
              {:else if cell.chest}
                <IconArchive size={20} />
              {:else}
                <IconShirt size={20} />
              {/if}
            </span>
            {#if cell.amount}<span class="amount" aria-hidden="true">{cell.amount}</span>{/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>
  <span id={`${id}-reached`} hidden>Reached</span>
  <span id={`${id}-unreached`} hidden>Not yet reached</span>
  <p class="reward-detail" aria-live="polite">
    {#if reward}{reward.label}{/if}
  </p>
</div>

<style>
  .reward-chart {
    display: grid;
    max-inline-size: 46rem;
    grid-template-columns: minmax(5.25rem, 8rem) minmax(0, 1fr);
    align-items: stretch;
    gap: 0.5rem;
    padding-block-start: 2rem;
  }

  .reward-grid {
    min-inline-size: 0;
  }

  .reward-row {
    display: grid;
    grid-template-columns: repeat(var(--reward-columns), minmax(0, 1fr));
  }

  .reward-cell {
    display: flex;
    min-inline-size: 0;
    min-block-size: 44px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-block-end: 1px solid var(--color-rule);
    color: var(--color-ink-muted);
    cursor: pointer;
  }

  .reward-cell[aria-selected="true"] {
    background: color-mix(in srgb, var(--color-category-renown) 15%, transparent);
    outline: 1px solid var(--color-category-renown-text);
    outline-offset: -1px;
  }

  .reward-cell[data-reached="true"] {
    color: var(--color-category-renown-text);
  }

  .reward-cell:focus-visible {
    outline: 2px solid var(--color-category-renown-text);
    outline-offset: -2px;
  }

  .reward-icon {
    display: grid;
    inline-size: 28px;
    block-size: 28px;
    place-items: center;
  }

  .reward-icon img {
    inline-size: 28px;
    block-size: 28px;
    object-fit: contain;
  }

  .amount {
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    line-height: 1;
  }

  .reward-detail {
    grid-column: 2;
    min-block-size: 2.75rem;
    color: var(--color-ink);
    font-family: var(--font-annotation);
    font-size: var(--text-sm);
  }

  @media (max-width: 47.99rem) {
    .reward-chart {
      grid-template-columns: minmax(5.5rem, 28%) minmax(0, 1fr);
    }

    .reward-row:nth-child(2n) .reward-cell {
      border-block-end-color: var(--color-ink-hairline);
    }
  }
</style>
