<script lang="ts">
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import InfoIcon from "@lucide/svelte/icons/info";
  import Loader2Icon from "@lucide/svelte/icons/loader-2";
  import OctagonXIcon from "@lucide/svelte/icons/octagon-x";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import { Toaster as Sonner, type ToasterProps as SonnerProps } from "svelte-sonner";

  import { theme } from "$lib/stores/theme.svelte.js";

  let { ...restProps }: SonnerProps = $props();
</script>

<Sonner
  theme={theme.resolved}
  class="toaster group"
  toastOptions={{
    unstyled: true,
    classes: {
      toast:
        "flex items-center gap-3 w-full rounded-xl border border-border bg-card px-4 py-3 shadow-md [&>[data-content]]:flex-1",
      title: "text-sm text-muted-foreground",
      description: "text-xs text-muted-foreground/70",
      cancelButton:
        "shrink-0 text-sm font-medium text-primary bg-primary/10 rounded-md px-2.5 py-1",
    },
  }}
  {...restProps}
>
  {#snippet loadingIcon()}
    <Loader2Icon class="size-4 animate-spin" />
  {/snippet}
  {#snippet successIcon()}
    <CircleCheckIcon class="size-4" />
  {/snippet}
  {#snippet errorIcon()}
    <OctagonXIcon class="size-4" />
  {/snippet}
  {#snippet infoIcon()}
    <InfoIcon class="size-4" />
  {/snippet}
  {#snippet warningIcon()}
    <TriangleAlertIcon class="size-4" />
  {/snippet}
</Sonner>
