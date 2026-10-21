<!--
  Applies app updates without a prompt, never mid-task. Once a newer version controls the page (or
  a deploy is detected with no worker to install it), the page reloads at its first safe moment:
  when nothing holds updates off and no dialog or text field is in use. Client-side navigations
  finish before their destination is probed & reloaded, preserving offline browsing. Renders nothing.
-->
<script lang="ts">
  import { onMount } from "svelte";

  import { reportClientVersion, watchForAppUpdate } from "#lib/pwa/app-update.js";
  import { createSafeReload } from "#lib/pwa/safe-reload.js";
  import { version } from "$app/env";
  import { afterNavigate } from "$app/navigation";
  import { updated } from "$app/state";

  import type { SafeReload } from "#lib/pwa/safe-reload.js";

  let watcher = $state.raw<ReturnType<typeof watchForAppUpdate>>();
  let safeReload: SafeReload | undefined;

  $effect(() => {
    if (updated.current) watcher?.newVersionDetected();
  });

  // Links, history, & programmatic navigations all use the same guarded reload at the destination.
  afterNavigate(({ type, shallow }) => {
    if (type === "enter" || shallow) return;
    safeReload?.navigationCompleted();
  });

  onMount(() => {
    reportClientVersion(version);
    const reloader = createSafeReload();
    safeReload = reloader;
    const appUpdate = watchForAppUpdate({
      onUpdateReady: () => {
        reloader.request();
      },
    });
    watcher = appUpdate;
    return () => {
      appUpdate.stop();
      reloader.stop();
    };
  });
</script>
