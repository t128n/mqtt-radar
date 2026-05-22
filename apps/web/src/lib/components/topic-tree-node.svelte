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
    selectedTopic = $bindable(""),
    onSelect
  } = $props<{
    node: {
      name: string;
      fullName: string;
      children: Map<string, any>;
    };
    level?: number;
    selectedTopic?: string;
    onSelect?: (topic: string) => void;
  }>();

  let expanded = $state(true);

  const hasChildren = $derived(node.children && node.children.size > 0);
  const isSelected = $derived(selectedTopic === node.fullName);

  function toggle() {
    expanded = !expanded;
  }

  function handleSelect() {
    if (!hasChildren) {
      if (selectedTopic === node.fullName) {
        selectedTopic = "";
      } else {
        selectedTopic = node.fullName;
      }
      if (onSelect) onSelect(selectedTopic);
    } else {
      toggle();
    }
  }
</script>

<div class="flex flex-col select-none">
  <!-- Node row -->
  <button
    type="button"
    class="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-muted/30 text-left font-mono text-[11px] transition-colors duration-150 group cursor-pointer border-0 w-full"
    style="padding-left: {8 + level * 12}px"
    class:bg-muted={isSelected}
    class:text-foreground={isSelected}
    class:text-muted-foreground={!isSelected}
    onclick={handleSelect}
  >
    {#if hasChildren}
      <span class="w-3 h-3 flex items-center justify-center text-muted-foreground/60 hover:text-foreground">
        {#if expanded}
          <ChevronDown size="11" />
        {:else}
          <ChevronRight size="11" />
        {/if}
      </span>
      <span class="text-muted-foreground/80 group-hover:text-foreground transition-colors shrink-0">
        {#if expanded}
          <FolderOpen size="12" />
        {:else}
          <Folder size="12" />
        {/if}
      </span>
    {:else}
      <span class="w-3 h-3"></span>
      <span class="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0">
        <Hash size="11" />
      </span>
    {/if}
    <span class="truncate pr-2 font-medium" class:font-semibold={isSelected}>
      {node.name}
    </span>
  </button>

  <!-- Nested children -->
  {#if hasChildren && expanded}
    <div class="flex flex-col relative">
      <!-- Guide Line -->
      <div 
        class="absolute top-0 bottom-0 border-l border-border/30" 
        style="left: {14 + level * 12}px"
      ></div>
      
      {#each Array.from(node.children.values()) as child}
        <svelte:self
          node={child}
          level={level + 1}
          bind:selectedTopic
          {onSelect}
        />
      {/each}
    </div>
  {/if}
</div>
