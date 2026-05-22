<!-- apps/web/src/lib/components/workspace-pane.svelte -->
<script lang="ts">
  import type { Snippet } from "svelte";

  // Props
  let {
    title,
    icon: IconComponent,
    headerRight,
    contentClass = "flex-grow p-4 text-xs text-muted-foreground font-mono",
    children
  }: {
    title: string;
    icon?: any;
    headerRight?: Snippet;
    contentClass?: string;
    children?: Snippet;
  } = $props();
</script>

<div class="flex flex-col h-full bg-background">
  <!-- Card Header -->
  <div class="h-9 min-h-9 flex items-center justify-between px-4 border-b border-border/40 bg-muted/5 select-none overflow-hidden">
    <div class="flex items-center gap-1.5 text-foreground min-w-0 shrink-0">
      {#if IconComponent}
        <IconComponent size="13" class="text-muted-foreground shrink-0" />
      {/if}
      <span class="text-xs font-semibold tracking-tight uppercase truncate">{title}</span>
    </div>
    {#if headerRight}
      <div class="flex items-center gap-2 shrink-0 ml-2 whitespace-nowrap">
        {@render headerRight()}
      </div>
    {/if}
  </div>

  <!-- Card Body -->
  <div class={contentClass}>
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>
