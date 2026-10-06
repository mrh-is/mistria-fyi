<script lang="ts">
  import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
  import { buttonVariants } from "#lib/components/ui/button/button.svelte";
  import { getName } from "#lib/data/names.js";
  import { canPlanConditionMutations } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { page } from "$app/state";

  import type { VisibilityCondition } from "#lib/types/visibility.js";

  let {
    condition,
    onCancel,
    onComplete,
    onCompleteAndUpdate,
    open = $bindable(false),
  }: {
    condition: VisibilityCondition;
    onCancel: () => void;
    onComplete: () => void;
    onCompleteAndUpdate: () => void;
    open?: boolean;
  } = $props();

  const invertible = $derived(canPlanConditionMutations(condition));
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{m.spoiler_dialog_title()}</AlertDialog.Title>
      <AlertDialog.Description>
        {m.spoiler_dialog_description()}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer class="flex-wrap">
      <AlertDialog.Cancel onclick={onCancel}
        >{getName("ui", "cancel", page.data.locale)}</AlertDialog.Cancel
      >
      <AlertDialog.Action
        class={`${buttonVariants({ variant: "outline" })} text-foreground`}
        onclick={onComplete}
      >
        {m.spoiler_dialog_confirm_item()}
      </AlertDialog.Action>
      {#if invertible}
        <AlertDialog.Action onclick={onCompleteAndUpdate}>
          {m.spoiler_dialog_confirm_and_update()}
        </AlertDialog.Action>
      {/if}
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
