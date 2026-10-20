<!--
  Applies app updates without a prompt, never mid-task. Once a newer version controls the page (or
  a deploy is detected with no worker to install it), the page reloads at its first safe moment:
  when nothing holds updates off and no dialog or text field is in use, or on its next client-side
  navigation, which loads its destination in full instead. Renders nothing.
-->
<script lang="ts">
  import { onMount } from "svelte";

  import { reportClientVersion, watchForAppUpdate } from "#lib/pwa/app-update.js";
  import { createSafeReload } from "#lib/pwa/safe-reload.js";
  import { version } from "$app/env";
  import { afterNavigate, beforeNavigate } from "$app/navigation";
  import { updated } from "$app/state";

  import type { SafeReload } from "#lib/pwa/safe-reload.js";

  let watcher = $state.raw<ReturnType<typeof watchForAppUpdate>>();
  let safeReload: SafeReload | undefined;

  $effect(() => {
    if (updated.current) watcher?.newVersionDetected();
  });

  // A link to another page loads it in full, so the destination arrives on the new version
  // without rendering on the old one first.
  beforeNavigate(({ type, cancel, to, willUnload }) => {
    if (willUnload || type !== "link" || !to) return;
    // A link within the page (a fragment) isn't leaving it.
    if (to.url.pathname === location.pathname && to.url.search === location.search) return;
    if (!safeReload?.claimNavigation()) return;
    cancel();
    location.assign(to.url.href);
  });

  // Back, forward, & programmatic navigations keep their history entry; reload where they landed.
  afterNavigate(({ type }) => {
    if (type === "enter" || !safeReload?.claimNavigation()) return;
    location.reload();
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
