<!-- apps/web/src/lib/components/topic-tree.svelte -->
<script lang="ts">
  import VirtualList from "@sveltejs/svelte-virtual-list";
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

  // Keep track of collapsed nodes by fullName. By default folders are expanded.
  let collapsedNodes = $state<Record<string, boolean>>({});

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

  // Flatten the tree into an array of visible nodes for the virtual list
  let visibleNodes = $derived.by(() => {
    const flat: Array<{ node: ParsedNode; level: number }> = [];

    const traverse = (nodes: ParsedNode[], level: number) => {
      for (const node of nodes) {
        flat.push({ node, level });
        const hasChildren = node.children.size > 0;
        if (hasChildren && !collapsedNodes[node.fullName]) {
          traverse(Array.from(node.children.values()), level + 1);
        }
      }
    };

    traverse(rootNodes, 0);
    return flat;
  });
</script>

<div class="flex-grow flex flex-col min-h-0 h-full w-full pr-1">
  {#if visibleNodes.length > 0}
    <VirtualList items={visibleNodes} let:item>
      <TopicTreeNode
        node={item.node}
        level={item.level}
        expanded={!collapsedNodes[item.node.fullName]}
        {selectedTopic}
        onSelect={(newTopic) => {
          selectedTopic = newTopic;
          if (onSelect) onSelect(newTopic);
        }}
        onToggle={() => {
          collapsedNodes[item.node.fullName] = !collapsedNodes[item.node.fullName];
        }}
      />
    </VirtualList>
  {:else}
    <div class="opacity-30 flex items-center justify-center h-full py-8 text-[11px]">
      No topics active.
    </div>
  {/if}
</div>
