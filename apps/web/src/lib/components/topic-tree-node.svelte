<!-- apps/web/src/lib/components/topic-tree-node.svelte -->
<script lang="ts">
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
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

<div class="relative flex flex-col select-none w-full mb-0.5">
  <!-- Render guide lines for levels -->
  {#each Array(level) as _, i}
    <div class="absolute top-0 bottom-[-2px] border-l border-border/30 pointer-events-none" style="left: {14 + i * 12}px"></div>
  {/each}

  <div
    class="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-muted/30 text-left font-mono text-[11px] transition-colors duration-150 group cursor-pointer border-0 w-full relative z-10"
    style="padding-left: {8 + level * 12}px"
    class:bg-muted={isSelected}
    class:text-foreground={isSelected}
    class:text-muted-foreground={!isSelected}
    onclick={handleSelect}
    onkeydown={(e) => e.key === 'Enter' && handleSelect()}
    role="button"
    tabindex="0"
  >
    {#if hasChildren}
      <button
        type="button"
        class="w-3 h-3 flex items-center justify-center text-muted-foreground/60 hover:text-foreground border-0 bg-transparent p-0 cursor-pointer shrink-0"
        onclick={handleToggle}
        aria-label="Toggle folder"
      >
        {#if expanded}
          <ChevronDown size="11" />
        {:else}
          <ChevronRight size="11" />
        {/if}
      </button>
      <button
        type="button"
        class="text-muted-foreground/80 group-hover:text-foreground transition-colors shrink-0 border-0 bg-transparent p-0 cursor-pointer flex items-center"
        onclick={handleToggle}
        aria-label="Toggle folder"
      >
        {#if expanded}
          <FolderOpen size="12" />
        {:else}
          <Folder size="12" />
        {/if}
      </button>
    {:else}
      <span class="w-3 h-3 shrink-0"></span>
      <span class="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0 flex items-center justify-center">
        <Hash size="11" />
      </span>
    {/if}
    <span class="truncate pr-2 font-medium flex-grow" class:font-semibold={isSelected}>
      {node.name}
    </span>
  </div>
</div>
