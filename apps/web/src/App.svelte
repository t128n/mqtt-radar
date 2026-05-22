<script lang="ts">
  import "./app.css";
  import { onMount } from "svelte";
  import * as Resizable from "~/lib/components/ui/resizable";
  import AppHeader from "~/lib/components/app-header.svelte";
  import ConnectionDialog from "~/lib/components/connection-dialog.svelte";
  import WorkspacePane from "~/lib/components/workspace-pane.svelte";
  import TopicTree from "~/lib/components/topic-tree.svelte";
  import { handlePairing, verifyPairing } from "~/lib/mqtt-radar";

  // Icons
  import FolderTree from "@lucide/svelte/icons/folder-tree";
  import Activity from "@lucide/svelte/icons/activity";
  import Braces from "@lucide/svelte/icons/braces";

  // Connection State
  let connection = $state<{ origin: string | null }>({
    origin: null,
  });
  let dialogOpen = $state(false);

  // Active MQTT feed states
  let topicsList = $state<string[]>([]);
  let cachedMessages = $state<Array<{ topic: string; payload: string; id: string; time: number }>>([]);
  let selectedTopic = $state("");
  let selectedMessage = $state<{ topic: string; payload: string; id: string; time: number } | null>(null);

  // Derived states
  let cachedMessagesCount = $derived(cachedMessages.length);

  // Filter messages by selected topic path
  let filteredMessages = $derived.by(() => {
    if (!selectedTopic) return cachedMessages;
    return cachedMessages.filter(
      (msg) => msg.topic === selectedTopic || msg.topic.startsWith(selectedTopic + "/")
    );
  });

  // Check if inspected payload is valid JSON
  let isJson = $derived.by(() => {
    if (!selectedMessage) return false;
    try {
      JSON.parse(selectedMessage.payload);
      return true;
    } catch {
      return false;
    }
  });

  // Format inspected payload
  let formattedPayload = $derived.by(() => {
    if (!selectedMessage) return "";
    try {
      const parsed = JSON.parse(selectedMessage.payload);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return selectedMessage.payload;
    }
  });

  // SSE event source connection
  let eventSource: EventSource | null = null;

  function connectSSE() {
    const activeOrigin = connection.origin;
    if (!activeOrigin) return;

    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    const sseUrl = `${activeOrigin}/api/events`;
    const es = new EventSource(sseUrl);

    es.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg && msg.topic) {
          // 1. Append new unique topics
          if (!topicsList.includes(msg.topic)) {
            topicsList = [...topicsList, msg.topic];
          }

          // 2. Add message to the rolling cache (max 500 messages)
          const newMsg = {
            topic: msg.topic,
            payload: msg.payload,
            id: event.lastEventId || Math.random().toString(36).substr(2, 9),
            time: Date.now(),
          };

          cachedMessages = [newMsg, ...cachedMessages].slice(0, 500);
        }
      } catch (err) {
        console.error("Failed to parse SSE message:", err);
      }
    });

    es.addEventListener("error", async (err) => {
      console.error("SSE connection error:", err);

      // If the connection drops or fails, double check if the pairing is still valid.
      if (activeOrigin) {
        const isValid = await verifyPairing(activeOrigin);
        if (!isValid) {
          console.warn("Connector is no longer reachable. Resetting connection...");

          // Clear connection state
          connection = { origin: null };

          // Clear localStorage
          localStorage.removeItem("mqtt_radar_connector_origin");

          // Show the pairing dialog so the user can easily pair again
          dialogOpen = true;
        }
      }
    });

    eventSource = es;
  }

  onMount(() => {
    connection = handlePairing();
    // Show the connection dialog by default if connector details are missing
    if (!connection.origin) {
      dialogOpen = true;
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  });

  // Synchronize SSE subscription to active pairing connection
  $effect(() => {
    if (connection.origin) {
      connectSSE();
    } else {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      topicsList = [];
      cachedMessages = [];
      selectedMessage = null;
    }
  });
</script>

<div class="h-dvh flex flex-col">
  <AppHeader bind:dialogOpen bind:connection />

  <Resizable.PaneGroup
    direction="horizontal"
    class="w-full flex-grow bg-background"
    autoSaveId="mqtt-radar-workspace"
  >
    <!-- 1. Topics Viewer Pane -->
    <Resizable.Pane defaultSize={30}>
      <WorkspacePane title="Topics" icon={FolderTree}>
        {#snippet headerRight()}
          <span class="font-mono text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded border border-border/50">
            {topicsList.length} active
          </span>
        {/snippet}

        {#if connection.origin}
          <TopicTree topics={topicsList} bind:selectedTopic />
        {:else}
          <div class="opacity-30 flex items-center justify-center h-full text-[11px]">
            Waiting for connector...
          </div>
        {/if}
      </WorkspacePane>
    </Resizable.Pane>

    <Resizable.Handle />

    <!-- 2. Message Stream Pane -->
    <Resizable.Pane defaultSize={30}>
      <WorkspacePane title="Stream" icon={Activity}>
        {#snippet headerRight()}
          <span class="font-mono text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded border border-border/50 select-all">
            {cachedMessagesCount} / 500
          </span>
        {/snippet}

        {#if filteredMessages.length > 0}
          <div class="flex flex-col gap-1 h-full overflow-y-auto pr-1 select-none scrollbar-none">
            {#each filteredMessages as msg (msg.id)}
              <button
                type="button"
                class="w-full flex items-baseline justify-between py-1.5 px-2 rounded hover:bg-muted/30 text-left font-mono text-[10.5px] transition-colors border-0 group cursor-pointer"
                class:bg-muted={selectedMessage?.id === msg.id}
                onclick={() => (selectedMessage = msg)}
              >
                <div class="flex flex-col gap-0.5 min-w-0 pr-4">
                  <span class="text-foreground font-semibold truncate group-hover:text-primary transition-colors">
                    {msg.topic}
                  </span>
                  <span class="text-muted-foreground/75 truncate max-w-full block text-[10px]">
                    {msg.payload}
                  </span>
                </div>
                <span class="text-muted-foreground/40 text-[9px] shrink-0 font-medium">
                  {new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </button>
            {/each}
          </div>
        {:else if connection.origin}
          <div class="opacity-30 flex items-center justify-center h-full text-[11px]">
            No messages received.
          </div>
        {:else}
          <div class="opacity-30 flex items-center justify-center h-full text-[11px]">
            Waiting for connector...
          </div>
        {/if}
      </WorkspacePane>
    </Resizable.Pane>

    <Resizable.Handle />

    <!-- 3. Inspect Pane -->
    <Resizable.Pane defaultSize={40}>
      <WorkspacePane title="Inspect" icon={Braces}>
        {#snippet headerRight()}
          <span class="font-mono text-[10px] text-muted-foreground uppercase">
            {selectedMessage ? (isJson ? "application/json" : "text/plain") : "application/json"}
          </span>
        {/snippet}

        {#if selectedMessage}
          <div class="flex flex-col gap-3 h-full overflow-y-auto pr-1 select-text scrollbar-none animate-in fade-in duration-150">
            <!-- Metadata Details -->
            <div class="flex flex-col gap-1 pb-2 border-b border-border/40 text-[10px]">
              <div class="flex justify-between items-baseline gap-2">
                <span class="text-muted-foreground font-semibold uppercase tracking-wider">Topic</span>
                <span class="text-foreground font-mono font-medium select-all break-all text-right">{selectedMessage.topic}</span>
              </div>
              <div class="flex justify-between items-baseline gap-2">
                <span class="text-muted-foreground font-semibold uppercase tracking-wider">Timestamp</span>
                <span class="text-foreground font-mono">{new Date(selectedMessage.time).toLocaleString()}</span>
              </div>
            </div>

            <!-- Formatted Pre block -->
            <pre class="bg-muted/10 border border-border/60 rounded-md p-3 font-mono text-[11px] leading-relaxed text-foreground select-all overflow-x-auto overflow-y-auto grow">{formattedPayload}</pre>
          </div>
        {:else}
          <div class="opacity-30 flex items-center justify-center h-full text-[11px]">
            Select a message to inspect.
          </div>
        {/if}
      </WorkspacePane>
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>

<!-- Pairing Dialog -->
<ConnectionDialog bind:open={dialogOpen} />
