<script lang="ts" module>
  import { tv, type VariantProps } from "tailwind-variants";

  export const toggleVariants = tv({
    base: "hover:bg-muted hover:text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-accent-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive inline-flex items-center justify-center gap-2 rounded-md text-base font-medium whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-11 min-w-11 px-2",
        lg: "h-11 min-w-11 px-2.5",
        sm: "h-9 min-w-9 px-1.5",
      },
      variant: {
        default: "bg-transparent",
        outline:
          "border-input hover:bg-accent hover:text-accent-foreground border bg-transparent shadow-xs",
      },
    },
  });

  export type ToggleSize = VariantProps<typeof toggleVariants>["size"];
  export type ToggleVariant = VariantProps<typeof toggleVariants>["variant"];
  export type ToggleVariants = VariantProps<typeof toggleVariants>;
</script>

<script lang="ts">
  import { Toggle as TogglePrimitive } from "bits-ui";

  import { cn } from "#lib/utils.js";

  let {
    class: className,
    pressed = $bindable(false),
    ref = $bindable(null),
    size = "default",
    variant = "default",
    ...restProps
  }: TogglePrimitive.RootProps & {
    size?: ToggleSize;
    variant?: ToggleVariant;
  } = $props();
</script>

<TogglePrimitive.Root
  bind:ref
  bind:pressed
  data-slot="toggle"
  class={cn(toggleVariants({ size, variant }), className)}
  {...restProps}
/>
