<script lang="ts">
  import "./app.css";
  import { onMount, tick } from "svelte";
  import * as Resizable from "~/lib/components/ui/resizable";
  import AppHeader from "~/lib/components/app-header.svelte";
  import ConnectionDialog from "~/lib/components/connection-dialog.svelte";
  import WorkspacePane from "~/lib/components/workspace-pane.svelte";
  import TopicTree from "~/lib/components/topic-tree.svelte";
  import { handlePairing, verifyPairing } from "~/lib/mqtt-radar";
  import VirtualList from "@sveltejs/svelte-virtual-list";

  // Icons
  import FolderTree from "@lucide/svelte/icons/folder-tree";
  import Activity from "@lucide/svelte/icons/activity";
  import Braces from "@lucide/svelte/icons/braces";
  import Search from "@lucide/svelte/icons/search";
  import X from "@lucide/svelte/icons/x";
  import Play from "@lucide/svelte/icons/play";
  import Pause from "@lucide/svelte/icons/pause";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Pin from "@lucide/svelte/icons/pin";
  import PinOff from "@lucide/svelte/icons/pin-off";

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

  // QoL States
  let isPaused = $state(false);
  let bufferedCount = $state(0);
  let autoPauseOnSelect = $state(true);
  let pinnedMessages = $state<Array<{ topic: string; payload: string; id: string; time: number }>>([]);
  let searchQuery = $state("");

  // Derived states
  let cachedMessagesCount = $derived(cachedMessages.length);
  let formattedMessageSize = $derived.by(() => {
    if (!selectedMessage) return "0 B";
    const bytes = new Blob([selectedMessage.payload]).size;
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    const decimals = i === 0 ? 0 : 2;
    return `${value.toFixed(decimals)} ${sizes[i]}`;
  });

  // Filter messages by search query
  let filteredMessages = $derived.by(() => {
    if (!searchQuery.trim()) {
      return cachedMessages;
    }
    const query = searchQuery.toLowerCase().trim();
    return cachedMessages.filter(
      (msg) =>
        msg.topic.toLowerCase().includes(query) ||
        msg.payload.toLowerCase().includes(query)
    );
  });

  // The list of messages to display in the UI
  let displayedMessages = $derived(filteredMessages);

  // Save pinned messages to localStorage
  $effect(() => {
    try {
      localStorage.setItem("mqtt_radar_pinned_messages", JSON.stringify(pinnedMessages));
    } catch (e) {
      console.error("Failed to save pinned messages", e);
    }
  });

  // Filter selection and cached messages if the active filter changes
  let prevSelectedTopic = "";
  $effect(() => {
    if (selectedTopic !== prevSelectedTopic) {
      selectedMessage = null;
      prevSelectedTopic = selectedTopic;
      
      if (selectedTopic) {
        // Keep only messages matching the selected topic or its sub-topics
        cachedMessages = cachedMessages.filter((msg) =>
          msg.topic === selectedTopic || msg.topic.startsWith(selectedTopic + "/")
        );
        messageBuffer = messageBuffer.filter((msg) =>
          msg.topic === selectedTopic || msg.topic.startsWith(selectedTopic + "/")
        );
      }
      
      bufferedCount = messageBuffer.length;
    }
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

  // Dynamic Shiki Syntax Highlighting
  let highlightedPayload = $state("");

  $effect(() => {
    if (!selectedMessage) {
      highlightedPayload = "";
      return;
    }

    const payload = selectedMessage.payload;
    let formatted = payload;
    let lang = "text";

    try {
      const parsed = JSON.parse(payload);
      formatted = JSON.stringify(parsed, null, 2);
      lang = "json";
    } catch {
      if (payload.trim().startsWith("<")) {
        lang = "xml";
      }
    }

    import("shiki").then(({ codeToHtml }) => {
      codeToHtml(formatted, {
        lang,
        themes: {
          light: "github-light",
          dark: "github-dark",
        },
      })
        .then((html) => {
          highlightedPayload = html;
        })
        .catch((err) => {
          console.error("Failed to highlight payload:", err);
          highlightedPayload = "";
        });
    }).catch((err) => {
      console.error("Failed to load shiki module:", err);
      highlightedPayload = "";
    });
  });

  // High-performance buffering for active MQTT feeds
  const knownTopics = new Set<string>();
  let messageBuffer: Array<{ topic: string; payload: string; id: string; time: number }> = [];
  let newTopicsBuffer: string[] = [];
  let flushScheduled = false;

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    requestAnimationFrame(() => {
      if (newTopicsBuffer.length > 0) {
        topicsList = [...topicsList, ...newTopicsBuffer];
        newTopicsBuffer = [];
      }
      
      if (!isPaused && messageBuffer.length > 0) {
        cachedMessages = [...messageBuffer, ...cachedMessages].slice(0, 500);
        messageBuffer = [];
        bufferedCount = 0;
      }
      flushScheduled = false;
    });
  }

  function resumeStream() {
    isPaused = false;
    bufferedCount = 0;
    if (messageBuffer.length > 0) {
      cachedMessages = [...messageBuffer, ...cachedMessages].slice(0, 500);
      messageBuffer = [];
    }
  }

  // SSE event source connection
  let eventSource: EventSource | null = null;
  let sseRetryCount = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const MAX_RETRIES = 5;

  function connectSSE(filter: string) {
    const activeOrigin = connection.origin;
    if (!activeOrigin) return;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    // Reset buffers
    knownTopics.clear();
    for (const t of topicsList) knownTopics.add(t);
    messageBuffer = [];
    newTopicsBuffer = [];
    flushScheduled = false;
    bufferedCount = 0;

    const sseUrl = `${activeOrigin}/api/events?filter=${encodeURIComponent(filter || "#")}`;
    const es = new EventSource(sseUrl);

    es.addEventListener("open", () => {
      console.log("SSE connection established");
      sseRetryCount = 0;
    });

    es.addEventListener("ping", () => {
      sseRetryCount = 0;
    });

    // Discovery connection sends lightweight topic events (legacy fallback)
    es.addEventListener("topic", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.topic) {
          if (!knownTopics.has(data.topic)) {
            knownTopics.add(data.topic);
            newTopicsBuffer.push(data.topic);
            scheduleFlush();
          }
        }
      } catch (err) {
        console.error("Failed to parse SSE topic event:", err);
      }
    });

    // Data connection sends full MQTT message events (legacy fallback)
    es.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg && msg.topic) {
          messageBuffer.unshift({
            topic: msg.topic,
            payload: msg.payload,
            id: `${msg.topic}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            time: Date.now(),
          });

          // Constrain buffer before flush just in case it's huge
          if (messageBuffer.length > 500) {
            messageBuffer.length = 500;
          }

          if (isPaused) {
            bufferedCount = messageBuffer.length;
          }

          scheduleFlush();
        }
      } catch (err) {
        console.error("Failed to parse SSE message event:", err);
      }
    });

    // Process batched events from the connector to mitigate high-frequency backpressure
    es.addEventListener("batch", (event) => {
      try {
        const batch = JSON.parse(event.data);
        if (Array.isArray(batch)) {
          let hasNewTopics = false;
          let hasNewMessages = false;

          for (const ev of batch) {
            if (ev.type === "topic" && ev.topic) {
              if (!knownTopics.has(ev.topic)) {
                knownTopics.add(ev.topic);
                newTopicsBuffer.push(ev.topic);
                hasNewTopics = true;
              }
            } else if (ev.type === "message" && ev.msg && ev.msg.topic) {
              messageBuffer.unshift({
                topic: ev.msg.topic,
                payload: ev.msg.payload,
                id: `${ev.msg.topic}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                time: Date.now(),
              });
              hasNewMessages = true;
            }
          }

          if (hasNewMessages) {
            // Constrain buffer before flush just in case it's huge
            if (messageBuffer.length > 500) {
              messageBuffer.length = 500;
            }

            if (isPaused) {
              bufferedCount = messageBuffer.length;
            }
          }

          if (hasNewTopics || hasNewMessages) {
            scheduleFlush();
          }
        }
      } catch (err) {
        console.error("Failed to parse SSE batch event:", err);
      }
    });

    es.addEventListener("error", async (err) => {
      console.error("SSE connection error:", err);

      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }

      if (sseRetryCount < MAX_RETRIES) {
        sseRetryCount++;
        // Exponential backoff with jitter
        const delay = Math.min(1000 * Math.pow(2, sseRetryCount) + Math.random() * 1000, 30000);
        console.warn(`SSE connection dropped. Retrying in ${Math.round(delay)}ms (attempt ${sseRetryCount}/${MAX_RETRIES})...`);

        reconnectTimer = setTimeout(() => {
          connectSSE(filter);
        }, delay);
      } else {
        console.warn(`SSE connection failed after ${MAX_RETRIES} attempts. Verifying pairing...`);

        // If the connection drops or fails permanently, double check if the pairing is still valid.
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
          } else {
            // Pairing is still valid, so maybe the connector is alive but SSE is failing.
            // Reset retry count and try again after a longer delay (10s) to avoid fast spinning.
            console.warn("Connector is still reachable, but SSE stream failed. Retrying in 10s...");
            sseRetryCount = 0;
            reconnectTimer = setTimeout(() => {
              connectSSE(filter);
            }, 10000);
          }
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

    try {
      const stored = localStorage.getItem("mqtt_radar_pinned_messages");
      if (stored) {
        pinnedMessages = JSON.parse(stored);
      }
    } catch (e) {
      console.error("Failed to load pinned messages", e);
    }

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (eventSource) eventSource.close();
    };
  });

  // Synchronize SSE subscription to active pairing connection and filter path
  $effect(() => {
    if (connection.origin) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      sseRetryCount = 0;
      connectSSE(selectedTopic);
    } else {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      topicsList = [];
      cachedMessages = [];
      selectedMessage = null;
      messageBuffer = [];
      bufferedCount = 0;
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
          <div class="flex items-center gap-1.5 select-none">
            {#if isPaused}
              <span class="font-mono text-[9px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 uppercase font-semibold">
                PAUSED
              </span>
            {/if}
            <span class="font-mono text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded border border-border/50 select-all">
              {cachedMessagesCount} / 500
            </span>
          </div>
        {/snippet}

        {#if connection.origin}
          <div class="flex-grow flex flex-col min-h-0 h-full w-full">
            <!-- Search & Controls Action Bar -->
            <div class="flex items-center gap-2 border-b border-border/40 pb-2 mb-2 shrink-0 pr-1">
              <!-- Search Input -->
              <div class="relative flex-grow">
                <Search size="11" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  type="text"
                  placeholder="Filter stream (topic or payload)..."
                  bind:value={searchQuery}
                  class="w-full bg-muted/20 border border-border/50 rounded px-7 py-1.5 text-[10.5px] font-mono text-foreground placeholder:text-muted-foreground/45 focus:border-border/80 focus:bg-muted/30 focus:outline-none transition-colors"
                />
                {#if searchQuery}
                  <button
                    type="button"
                    class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                    onclick={() => searchQuery = ""}
                  >
                    <X size="11" />
                  </button>
                {/if}
              </div>

              <!-- Stream Controls -->
              <div class="flex items-center gap-1 shrink-0">
                <!-- Play/Pause -->
                <button
                  type="button"
                  class="p-1.5 rounded border border-border/40 hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-all cursor-pointer flex items-center justify-center h-7 w-7 {isPaused ? 'bg-amber-500/10! border-amber-500/20! text-amber-500 hover:text-amber-600' : ''}"
                  title={isPaused ? "Resume Stream" : "Pause Stream"}
                  onclick={() => {
                    if (isPaused) {
                      resumeStream();
                    } else {
                      isPaused = true;
                    }
                  }}
                >
                  {#if isPaused}
                    <Play size="11" />
                  {:else}
                    <Pause size="11" />
                  {/if}
                </button>

                <!-- Clear -->
                <button
                  type="button"
                  class="p-1.5 rounded border border-border/40 hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center justify-center h-7 w-7"
                  title="Clear Stream"
                  onclick={() => {
                    cachedMessages = [];
                    messageBuffer = [];
                    bufferedCount = 0;
                    selectedMessage = null;
                  }}
                >
                  <Trash2 size="11" />
                </button>
              </div>
            </div>

            <!-- Pinned Section -->
            {#if pinnedMessages.length > 0}
              <div class="flex flex-col border-b border-border/40 pb-2 mb-2 shrink-0 pr-1 select-none">
                <div class="flex items-center justify-between px-2 py-0.5 mb-1 text-[9px] text-muted-foreground uppercase font-bold tracking-wider">
                  <span class="flex items-center gap-1 text-primary">
                    <Pin size="10" class="fill-primary text-primary" /> Pinned
                  </span>
                  <button
                    type="button"
                    class="hover:text-foreground transition-colors cursor-pointer normal-case text-[9px] font-normal"
                    onclick={() => pinnedMessages = []}
                  >
                    Unpin All
                  </button>
                </div>
                <div class="flex flex-col gap-1 px-0.5 max-h-40 overflow-y-auto">
                  {#each pinnedMessages as msg (msg.id)}
                    {@const isSelected = selectedMessage?.id === msg.id}
                    <div class="relative group">
                      <button
                        type="button"
                        class="w-full flex items-baseline justify-between py-1.5 pl-2 pr-8 rounded text-left font-mono text-[10.5px] transition-colors border group/btn cursor-pointer {isSelected ? 'bg-muted border-border' : 'hover:bg-muted/30 border-transparent bg-muted/5'}"
                        onclick={() => {
                          if (isSelected) {
                            selectedMessage = null;
                            resumeStream();
                          } else {
                            selectedMessage = msg;
                            if (autoPauseOnSelect) {
                              isPaused = true;
                            }
                          }
                        }}
                      >
                        <div class="flex flex-col gap-0.5 min-w-0 pr-4">
                          <span class="text-foreground font-semibold truncate group-hover/btn:text-primary transition-colors">
                            {msg.topic}
                          </span>
                          <span class="text-muted-foreground/75 truncate max-w-full block text-[10px]">
                            {msg.payload}
                          </span>
                        </div>
                        <span class="text-muted-foreground/40 text-[9px] shrink-0 font-medium mr-1">
                          {new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </button>
                      <button
                        type="button"
                        class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-primary cursor-pointer transition-colors"
                        title="Unpin message"
                        onclick={(e) => {
                          e.stopPropagation();
                          pinnedMessages = pinnedMessages.filter(p => p.id !== msg.id);
                        }}
                      >
                        <PinOff size="11" />
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Message Stream List -->
            <div class="flex-grow flex flex-col min-h-0 h-full w-full relative">
              {#if displayedMessages.length > 0}
                <div class="flex-grow flex flex-col min-h-0 h-full w-full pr-1">
                  <VirtualList items={displayedMessages} let:item={msg}>
                    {@const isSelected = selectedMessage?.id === msg.id}
                    {@const isPinned = pinnedMessages.some(p => p.id === msg.id)}
                    <div class="relative group mb-1">
                      <button
                        type="button"
                        class="w-full flex items-baseline justify-between py-1.5 pl-2 pr-8 rounded text-left font-mono text-[10.5px] transition-colors border group/btn cursor-pointer {isSelected ? 'bg-muted border-border' : 'hover:bg-muted/30 border-transparent'}"
                        onclick={() => {
                          if (isSelected) {
                            selectedMessage = null;
                            resumeStream();
                          } else {
                            selectedMessage = msg;
                            if (autoPauseOnSelect) {
                              isPaused = true;
                            }
                          }
                        }}
                      >
                        <div class="flex flex-col gap-0.5 min-w-0 pr-4">
                          <span class="text-foreground font-semibold truncate group-hover/btn:text-primary transition-colors">
                            {msg.topic}
                          </span>
                          <span class="text-muted-foreground/75 truncate max-w-full block text-[10px]">
                            {msg.payload}
                          </span>
                        </div>
                        <span class="text-muted-foreground/40 text-[9px] shrink-0 font-medium mr-1">
                          {new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </button>
                      <button
                        type="button"
                        class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground cursor-pointer transition-colors opacity-0 group-hover:opacity-100 {isPinned ? 'opacity-100! text-primary' : ''}"
                        title={isPinned ? "Unpin message" : "Pin message"}
                        onclick={(e) => {
                          e.stopPropagation();
                          if (isPinned) {
                            pinnedMessages = pinnedMessages.filter(p => p.id !== msg.id);
                          } else {
                            pinnedMessages = [...pinnedMessages, msg];
                          }
                        }}
                      >
                        <Pin size="11" class={isPinned ? "fill-primary text-primary" : ""} />
                      </button>
                    </div>
                  </VirtualList>
                </div>
              {:else}
                <div class="opacity-30 flex items-center justify-center h-full text-[11px] font-mono select-none">
                  {#if searchQuery}
                    No messages match filter.
                  {:else}
                    No messages received.
                  {/if}
                </div>
              {/if}
            </div>
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
          <div class="flex items-center gap-1.5 select-none">
            {#if selectedMessage}
              {@const isPinned = pinnedMessages.some(p => p.id === selectedMessage?.id)}
              <button
                type="button"
                class="font-mono text-[9px] flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors cursor-pointer {isPinned ? 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/20' : 'bg-muted/30 border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground'}"
                onclick={() => {
                  if (isPinned) {
                    pinnedMessages = pinnedMessages.filter(p => p.id !== selectedMessage!.id);
                  } else {
                    pinnedMessages = [...pinnedMessages, selectedMessage!];
                  }
                }}
              >
                <Pin size="9.5" class={isPinned ? "fill-primary text-primary" : ""} />
                {isPinned ? "Pinned" : "Pin"}
              </button>
            {/if}
            <span class="font-mono text-[10px] text-muted-foreground uppercase">
              {selectedMessage ? (isJson ? "application/json" : "text/plain") : "application/json"}
            </span>
          </div>
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
              <div class="flex justify-between items-baseline gap-2">
                <span class="text-muted-foreground font-semibold uppercase tracking-wider">Size</span>
                <span class="text-foreground font-mono">{formattedMessageSize}</span>
              </div>
            </div>

            <!-- Formatted Pre block with Shiki highlighting -->
            {#if highlightedPayload}
              {@html highlightedPayload}
            {:else}
              <pre class="bg-muted/10 border border-border/60 rounded-md p-3 font-mono text-[11px] leading-relaxed text-foreground select-all overflow-x-auto overflow-y-auto grow">{formattedPayload}</pre>
            {/if}
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
