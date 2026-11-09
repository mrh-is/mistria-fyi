<script lang="ts">
  import { Icon } from "#lib/components/icon/index.js";
  import TagDialog from "#lib/components/tag-dialog.svelte";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import * as m from "#lib/paraglide/messages.js";
  import { shelfLabel } from "#lib/presentation/shelves.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { seasonLabel, weatherLabel } from "#lib/utils/format.js";
  import { page } from "$app/state";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let season = $derived(userState.state.worldState.season);
  let weather = $derived(userState.state.worldState.weather);
</script>

<TagDialog bind:open>
  <div class="shelf-tag__body">
    <div class="shelf-tag__heading">
      <span class="shelf-tag__day">
        <Icon.Season {season} class="size-3.5" />
        <Icon.Weather {season} {weather} class="size-3.5" />
        {m.shelf_explainer_day({
          season: seasonLabel(season, page.data.locale),
          weather: weatherLabel(weather, season),
        })}
      </span>
      <Dialog.Title>{m.shelf_explainer_title()}</Dialog.Title>
      <Dialog.Description class="sr-only">{m.shelf_explainer_description()}</Dialog.Description>
    </div>
    <dl class="shelf-tag__list">
      <dt>{shelfLabel("todo")}</dt>
      <dd>{m.shelf_explainer_todo()}</dd>
      <dt>{shelfLabel("notNow")}</dt>
      <dd>{m.shelf_explainer_not_now()}</dd>
      <dt>{shelfLabel("completed")}</dt>
      <dd>{m.shelf_explainer_completed()}</dd>
    </dl>
  </div>
  <div class="shelf-tag__footer">
    <Dialog.Close class="inventory-tag__close">{m.source_explainer_dismiss()}</Dialog.Close>
  </div>
</TagDialog>

<style>
  .shelf-tag__body {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    padding: 15px 16px 0;
  }

  .shelf-tag__heading {
    padding-bottom: 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-tag-ink) 42%, transparent);
  }

  .shelf-tag__day {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--color-tag-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
  }

  .shelf-tag__list {
    display: grid;
    gap: 2px;
    margin: 0;
    padding-block: 10px;
    color: var(--color-tag-ink);
  }

  .shelf-tag__list dt {
    font-family: var(--font-controls);
    font-size: var(--text-2xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .shelf-tag__list dd {
    margin: 0 0 8px;
    font-size: var(--text-sm);
  }

  .shelf-tag__footer {
    display: flex;
    justify-content: flex-end;
    padding: 0 16px 14px;
  }
</style>
