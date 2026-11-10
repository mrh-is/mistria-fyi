<script lang="ts">
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { syncReceiver } from "#lib/sync/receiver-state.svelte.js";
  import { BACKUP_FILE_PREFIX, downloadJson } from "#lib/utils/download.js";
  import { page } from "$app/state";

  import { factsQuestionBody } from "./sync-question-copy.js";
  import SyncTagDialog from "./sync-tag-dialog.svelte";

  import type { SyncAnswer } from "#lib/engine/sync-apply.js";
  import type { SyncApplyQuestion } from "#lib/stores/user-state.svelte.js";

  import type { SyncDialogAction } from "./sync-tag-dialog.svelte";

  let { question }: { question: SyncApplyQuestion } = $props();

  let open = $state(true);

  function answer(value: SyncAnswer): void {
    void syncReceiver.answer(question.id, value);
  }

  function later(): void {
    syncReceiver.dismissQuestion();
  }

  function saveOldBackup(): void {
    const kept = userState.farmSwitchBackup;
    if (kept) downloadJson(JSON.stringify(kept.backup), BACKUP_FILE_PREFIX);
  }

  /** Closing the dialog any other way is the same as “Not now”. */
  function changed(next: boolean): void {
    if (!next) later();
  }

  const copy = $derived.by((): { actions: SyncDialogAction[]; body: string; title: string } => {
    const notNow: SyncDialogAction = {
      label: /* @wc-context: sync question later */ "Not now",
      onclick: later,
    };
    switch (question.kind) {
      case "farm":
        return {
          actions: [
            notNow,
            {
              label: "Nope, it’s a new farm",
              onclick: () => {
                answer("new-farm");
              },
            },
            {
              label: "Yep, same farm",
              onclick: () => {
                answer("same-farm");
              },
              primary: true,
            },
          ],
          body: question.farmName
            ? `This save file is for ${question.farmName}, but we can’t tell which farm the progress here belongs to.`
            : "We found a farm in this save file, but we can’t tell which farm the progress here belongs to.",
          title: "Is this the farm you’ve been tracking?",
        };
      case "older-save":
        return {
          actions: [
            notNow,
            {
              label: "Keep what’s here",
              onclick: () => {
                answer("keep");
              },
            },
            {
              label: "Go back to it",
              onclick: () => {
                answer("accept");
              },
              primary: true,
            },
          ],
          body: "This save file has less playtime than the last one we read, so it looks like you loaded an older save. Anything you checked off by hand sticks around either way.",
          title: "Go back to an older save file?",
        };
      case "facts":
        return {
          actions: [
            notNow,
            {
              label: "Keep mine",
              onclick: () => {
                answer("keep");
              },
            },
            {
              label: "Use the save file",
              onclick: () => {
                answer("accept");
              },
              primary: true,
            },
          ],
          body: factsQuestionBody(question, page.data.locale),
          title: "Your save file sees this differently",
        };
      case "replace-backup": {
        const date = new Intl.DateTimeFormat(page.data.locale, { dateStyle: "medium" }).format(
          question.savedAt,
        );
        return {
          actions: [
            notNow,
            { label: "Save the old one first", onclick: saveOldBackup },
            {
              label: "Replace it",
              onclick: () => {
                answer("accept");
              },
              primary: true,
            },
          ],
          body: question.farmName
            ? `This save file is a different farm, so we’ll back up the one here. That replaces your backup of ${question.farmName}, from ${date}.`
            : `This save file is a different farm, so we’ll back up the one here. That replaces your backup from ${date}.`,
          title: "Only one farm backup fits",
        };
      }
    }
  });
</script>

<SyncTagDialog
  bind:open
  actions={copy.actions}
  body={copy.body}
  onOpenChange={changed}
  title={copy.title}
/>
