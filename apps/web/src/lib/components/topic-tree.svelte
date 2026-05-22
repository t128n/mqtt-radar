<!-- apps/web/src/lib/components/topic-tree.svelte -->
<script lang="ts">
  import TopicTreeNode from "./topic-tree-node.svelte";

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

  // Parse list of topics to a tree structure recursively
  let rootNodes = $derived.by(() => {
    const root: Map<string, ParsedNode> = new Map();

    for (const topic of topics) {
      if (!topic) continue;
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
</script>

<div class="flex flex-col gap-0.5 max-h-full overflow-y-auto pr-1 select-none scrollbar-none">
  {#if rootNodes.length > 0}
    {#each rootNodes as node}
      <TopicTreeNode
        {node}
        bind:selectedTopic
        {onSelect}
      />
    {/each}
  {:else}
    <div class="opacity-30 flex items-center justify-center h-full py-8 text-[11px]">
      No topics active.
    </div>
  {/if}
</div>
