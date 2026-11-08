<script lang="ts">
  import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
  import { buttonVariants } from "#lib/components/ui/button/button.svelte";
  import { canPlanConditionMutations } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";

  import type { GuardSubject } from "#lib/controllers/spoiler-guard.svelte.js";
  import type { VisibilityCondition } from "#lib/types/visibility.js";

  let {
    condition,
    onCancel,
    onComplete,
    onCompleteAndUpdate,
    open = $bindable(false),
    subject,
  }: {
    condition: VisibilityCondition;
    onCancel: () => void;
    onComplete: () => void;
    onCompleteAndUpdate: () => void;
    open?: boolean;
    /** What the dialog asks about; absent for an item whose name is still covered. */
    subject?: GuardSubject;
  } = $props();

  const invertible = $derived(canPlanConditionMutations(condition));
  // Checking off an item whose name is still covered gets the playful wording; anything the player
  // can see gets the plain question. Without the update button, "just this" has nothing to
  // contrast with.
  const copy = $derived.by(() => {
    if (subject === undefined) {
      return {
        complete: invertible ? m.spoiler_dialog_yolo_item() : m.spoiler_dialog_yolo(),
        completeAndUpdate: m.spoiler_dialog_yolo_and_update(),
        description: m.spoiler_dialog_masked_description(),
        title: m.spoiler_dialog_masked_title(),
      };
    }
    const plain = {
      complete: invertible ? m.spoiler_dialog_confirm_item() : m.spoiler_dialog_confirm(),
      completeAndUpdate: m.spoiler_dialog_confirm_and_update(),
    };
    return "floor" in subject
      ? {
          ...plain,
          description: m.spoiler_dialog_floor_description(),
          title: m.spoiler_dialog_floor_title({ floor: subject.floor }),
        }
      : {
          ...plain,
          description: m.spoiler_dialog_description(),
          title: m.spoiler_dialog_title({ name: subject.name }),
        };
  });
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{copy.title}</AlertDialog.Title>
      <AlertDialog.Description>
        {copy.description}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer class="flex-wrap">
      <AlertDialog.Cancel onclick={onCancel}>{m.spoiler_dialog_cancel()}</AlertDialog.Cancel>
      <AlertDialog.Action
        class={`${buttonVariants({ variant: invertible ? "outline" : "default" })} ${invertible ? "text-foreground" : ""}`}
        onclick={onComplete}
      >
        {copy.complete}
      </AlertDialog.Action>
      {#if invertible}
        <AlertDialog.Action onclick={onCompleteAndUpdate}>
          {copy.completeAndUpdate}
        </AlertDialog.Action>
      {/if}
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
