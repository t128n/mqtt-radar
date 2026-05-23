<!-- apps/web/src/lib/components/topic-tree-node.svelte -->
<script lang="ts">
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Folder from "@lucide/svelte/icons/folder";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import Hash from "@lucide/svelte/icons/hash";
  
  // Props
  let {
    node,
    level = 0,
    expanded = false,
    selectedTopic = "",
    onSelect,
    onToggle
  } = $props<{
    node: {
      name: string;
      fullName: string;
      children: Map<string, any>;
    };
    level?: number;
    expanded?: boolean;
    selectedTopic?: string;
    onSelect?: (topic: string) => void;
    onToggle?: () => void;
  }>();

  const hasChildren = $derived(node.children && node.children.size > 0);
  const isSelected = $derived(selectedTopic === node.fullName);

  function handleSelect() {
    if (onSelect) {
      onSelect(selectedTopic === node.fullName ? "" : node.fullName);
    }
  }

  function handleToggle(e: Event) {
    e.stopPropagation();
    if (onToggle) onToggle();
  }
</script>

<div class="relative flex flex-col select-none w-full mb-0.5 group/node">
  <!-- Render guide lines for levels with subtle hover transitions -->
  {#each Array(level) as _, i}
    <div
      class="absolute top-0 bottom-0 w-[1px] bg-border group-hover/node:bg-primary/40 transition-colors duration-150 pointer-events-none"
      style="left: {14 + i * 12}px"
    ></div>
  {/each}

  <div
    class="flex items-center gap-1.5 py-1.5 px-2 rounded-md text-left font-mono text-[11px] transition-all duration-150 group cursor-pointer w-full relative z-10 select-none border {isSelected ? 'bg-primary/10 text-primary border-primary/20 font-semibold' : 'text-foreground/80 hover:bg-muted/50 hover:text-foreground border-transparent font-medium'}"
    style="padding-left: {8 + level * 12}px"
    onclick={handleSelect}
    onkeydown={(e) => e.key === 'Enter' && handleSelect()}
    role="button"
    tabindex="0"
  >
    <!-- Accent line for active selection -->
    {#if isSelected}
      <div class="absolute left-0 top-[5px] bottom-[5px] w-[3px] bg-primary rounded-r transition-all duration-200"></div>
    {/if}

    {#if hasChildren}
      <button
        type="button"
        class="w-3.5 h-3.5 flex items-center justify-center text-foreground/50 group-hover:text-foreground/90 border-0 bg-transparent p-0 cursor-pointer shrink-0 transition-transform duration-200"
        onclick={handleToggle}
        aria-label="Toggle folder"
      >
        <ChevronRight size="11" class="transition-transform duration-200 {expanded ? 'rotate-90 text-foreground/90' : 'rotate-0 text-foreground/50'}" />
      </button>
      <button
        type="button"
        class="text-foreground/65 group-hover:text-foreground transition-colors shrink-0 border-0 bg-transparent p-0 cursor-pointer flex items-center"
        onclick={handleToggle}
        aria-label="Toggle folder"
      >
        {#if expanded}
          <FolderOpen size="12" class="text-primary" />
        {:else}
          <Folder size="12" class="text-foreground/60" />
        {/if}
      </button>
    {:else}
      <span class="w-3.5 h-3.5 shrink-0"></span>
      <span class="text-foreground/45 group-hover:text-foreground/80 transition-colors shrink-0 flex items-center justify-center">
        <Hash size="11" />
      </span>
    {/if}
    <span class="truncate pr-2 flex-grow">
      {node.name}
    </span>
  </div>
</div>
