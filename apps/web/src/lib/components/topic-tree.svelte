<!-- apps/web/src/lib/components/topic-tree.svelte -->
<script lang="ts">
  import VirtualList from "@sveltejs/svelte-virtual-list";
  import TopicTreeNode from "./topic-tree-node.svelte";
  import Search from "@lucide/svelte/icons/search";
  import X from "@lucide/svelte/icons/x";

  // Props
  let {
    topics = [],
    selectedTopic = $bindable(""),
    onSelect
  } = $props<{
    topics: string[];
    selectedTopic?: string;
    onSelect?: (topic: string) => void;
  }>();

  interface ParsedNode {
    name: string;
    fullName: string;
    children: Map<string, ParsedNode>;
  }

  // Keep track of collapsed nodes by fullName. By default folders are expanded.
  let collapsedNodes = $state<Record<string, boolean>>({});

  // Local search query state
  let searchQuery = $state("");

  // Parse list of topics to a tree structure recursively, optionally filtered by searchQuery
  let rootNodes = $derived.by(() => {
    const root: Map<string, ParsedNode> = new Map();
    const query = searchQuery.toLowerCase().trim();

    for (const topic of topics) {
      if (!topic) continue;

      // If we have a query, ensure either the topic matches
      if (query && !topic.toLowerCase().includes(query)) {
        continue;
      }

      const parts = topic.split("/");
      let currentMap = root;
      let pathAccumulator = "";

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        pathAccumulator = pathAccumulator ? `${pathAccumulator}/${part}` : part;
        
        if (!currentMap.has(part)) {
          currentMap.set(part, {
            name: part,
            fullName: pathAccumulator,
            children: new Map()
          });
        }
        currentMap = currentMap.get(part)!.children;
      }
    }

    // Sort recursively: folders first, then leaves, then alphabetical
    const sortTree = (map: Map<string, ParsedNode>): ParsedNode[] => {
      const nodes = Array.from(map.values());
      
      // Recursively sort children
      for (const node of nodes) {
        if (node.children.size > 0) {
          // Trigger sorting on children
          node.children = new Map(
            sortTree(node.children).map(c => [c.name, c])
          );
        }
      }

      nodes.sort((a, b) => {
        const aHasKids = a.children.size > 0;
        const bHasKids = b.children.size > 0;
        if (aHasKids && !bHasKids) return -1;
        if (!aHasKids && bHasKids) return 1;
        return a.name.localeCompare(b.name);
      });
      
      return nodes;
    };

    return sortTree(root);
  });

  // Flatten the tree into an array of visible nodes for the virtual list
  let visibleNodes = $derived.by(() => {
    const flat: Array<{ node: ParsedNode; level: number }> = [];

    const traverse = (nodes: ParsedNode[], level: number) => {
      for (const node of nodes) {
        flat.push({ node, level });
        const hasChildren = node.children.size > 0;
        const isCollapsed = searchQuery.trim() !== "" ? false : collapsedNodes[node.fullName];
        if (hasChildren && !isCollapsed) {
          traverse(Array.from(node.children.values()), level + 1);
        }
      }
    };

    traverse(rootNodes, 0);
    return flat;
  });
</script>

<div class="flex-grow flex flex-col min-h-0 h-full w-full pr-1">
  <!-- Search input bar -->
  <div class="relative w-full pb-2 mb-2 border-b border-border/40 shrink-0 select-none">
    <Search size="11" class="absolute left-2.5 top-[7px] text-muted-foreground/60" />
    <input
      type="text"
      placeholder="Filter topics..."
      bind:value={searchQuery}
      class="w-full bg-muted/20 border border-border/50 rounded px-7 py-1.5 text-[10.5px] font-mono text-foreground placeholder:text-muted-foreground/45 focus:border-border/80 focus:bg-muted/30 focus:outline-none transition-colors"
    />
    {#if searchQuery}
      <button
        type="button"
        class="absolute right-2 top-[7px] p-0.5 rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
        onclick={() => searchQuery = ""}
      >
        <X size="11" />
      </button>
    {/if}
  </div>

  {#if visibleNodes.length > 0}
    <div class="flex-grow min-h-0 h-full w-full relative">
      <VirtualList items={visibleNodes} let:item>
        <TopicTreeNode
          node={item.node}
          level={item.level}
          expanded={searchQuery.trim() !== "" ? true : !collapsedNodes[item.node.fullName]}
          {selectedTopic}
          onSelect={(newTopic) => {
            selectedTopic = newTopic;
            if (onSelect) onSelect(newTopic);
          }}
          onToggle={() => {
            if (searchQuery.trim() === "") {
              collapsedNodes[item.node.fullName] = !collapsedNodes[item.node.fullName];
            }
          }}
        />
      </VirtualList>
    </div>
  {:else}
    <div class="opacity-30 flex items-center justify-center h-full py-8 text-[11px] font-mono select-none">
      {#if searchQuery}
        No topics match filter.
      {:else}
        No topics active.
      {/if}
    </div>
  {/if}
</div>
