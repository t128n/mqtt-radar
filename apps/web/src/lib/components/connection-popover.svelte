<script lang="ts">
  import { Button, buttonVariants } from "~/lib/components/ui/button/index.js";
  import * as Popover from "~/lib/components/ui/popover/index.js";
  import { Input } from "~/lib/components/ui/input/index.js";
  import { Label } from "~/lib/components/ui/label/index.js";
  import { createConnectorClient } from "~/lib/mqtt-radar";
  import { cn } from "~/lib/utils.js";

  import Loader2 from "@lucide/svelte/icons/loader-2";

  // Props
  let {
    connection = $bindable({ origin: null }),
    dialogOpen = $bindable(false)
  } = $props();

  // Broker Status State
  let brokerStatus = $state<{ connected: boolean; url?: string; clientId?: string } | null>(null);

  // Connection display helper
  let displayStatus = $derived.by(() => {
    if (!connection.origin) {
      return {
        text: "Offline",
        dotClass: "bg-muted-foreground/30 border-muted-foreground/20",
        textClass: "text-muted-foreground/50"
      };
    }
    
    if (brokerStatus && brokerStatus.connected) {
      let host = "Connected";
      if (brokerStatus.url) {
        try {
          const urlStr = brokerStatus.url.replace(/^mqtt(s)?:\/\//, "http://");
          const parsed = new URL(urlStr);
          host = parsed.host;
        } catch {
          host = brokerStatus.url.replace(/^mqtt(s)?:\/\//, "");
        }
      }
      return {
        text: host,
        dotClass: "bg-emerald-500 border-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.4)]",
        textClass: "text-foreground font-medium"
      };
    }
    
    return {
      text: "Broker Offline",
      dotClass: "bg-amber-500 border-amber-600 shadow-[0_0_8px_rgba(245,158,11,0.4)]",
      textClass: "text-muted-foreground/75"
    };
  });

  // Derived client
  let client = $derived(
    connection.origin
      ? createConnectorClient(connection.origin)
      : null
  );

  // Broker Form State
  let brokerUrl = $state("mqtt://localhost:1883");
  let brokerClientId = $state("mqtt-radar-client");
  let brokerUsername = $state("");
  let brokerPassword = $state("");
  let brokerConnecting = $state(false);
  let brokerError = $state<string | null>(null);

  // TLS State
  let showTlsSettings = $state(false);
  let brokerCa = $state("");
  let brokerCert = $state("");
  let brokerKey = $state("");
  let brokerRejectUnauthorized = $state(true);

  async function fetchBrokerStatus() {
    if (!client) {
      brokerStatus = null;
      return;
    }
    try {
      const res = await client("/api/broker", { method: "GET" });
      brokerStatus = res;
    } catch (err: any) {
      console.error("Failed to fetch broker status:", err);
      brokerStatus = null;
      if (err.status === 401) {
        clearConnection();
      }
    }
  }

  function clearConnection() {
    localStorage.removeItem("mqtt_radar_connector_origin");
    connection.origin = null;
    dialogOpen = true;
  }

  async function connectBroker(e: SubmitEvent) {
    e.preventDefault();
    if (!client) return;

    brokerConnecting = true;
    brokerError = null;
    try {
      const payload = {
        url: brokerUrl,
        ...(brokerClientId && { clientId: brokerClientId }),
        ...(brokerUsername && { username: brokerUsername }),
        ...(brokerPassword && { password: brokerPassword }),
        ...(showTlsSettings && {
          ...(brokerCa && { ca: brokerCa }),
          ...(brokerCert && { cert: brokerCert }),
          ...(brokerKey && { key: brokerKey }),
          rejectUnauthorized: brokerRejectUnauthorized,
        }),
      };

      const res = await client("/api/broker", {
        method: "POST",
        body: payload
      });

      if (res && res.ok) {
        await fetchBrokerStatus();
      } else {
        brokerError = "Failed to connect to broker";
      }
    } catch (err: any) {
      console.error(err);
      brokerError = err.data?.detail || err.message || "Failed to connect";
    } finally {
      brokerConnecting = false;
    }
  }

  async function disconnectBroker() {
    if (!client) return;
    try {
      await client("/api/broker", {
        method: "DELETE"
      });
      await fetchBrokerStatus();
    } catch (err) {
      console.error("Failed to disconnect:", err);
    }
  }

  $effect(() => {
    if (connection.origin) {
      fetchBrokerStatus();
      const interval = setInterval(fetchBrokerStatus, 5000);
      return () => clearInterval(interval);
    }
  });
</script>

<Popover.Root>
  <Popover.Trigger class={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex items-center gap-1 font-mono text-[10px] select-none cursor-pointer px-2.5 py-1 rounded-md border border-border/80 bg-background hover:bg-muted/30 transition-colors")}>
    <!-- Left: Connector Segment -->
    <div class="flex items-center gap-1.5 pr-0.5">
      <span class={cn("h-1.5 w-1.5 rounded-full shrink-0 border transition-all duration-300", 
        connection.origin 
          ? "bg-emerald-500 border-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.4)]" 
          : "bg-muted-foreground/30 border-muted-foreground/20"
      )}></span>
      <span class={cn(
        connection.origin ? "text-foreground font-medium" : "text-muted-foreground/50"
      )}>
        connector
      </span>
    </div>

    <!-- Divider -->
    <span class="text-muted-foreground/25 font-light px-0.5">/</span>

    <!-- Right: Broker Segment -->
    <div class="flex items-center gap-1.5 pl-0.5">
      <span class={cn("h-1.5 w-1.5 rounded-full shrink-0 border transition-all duration-300", 
        !connection.origin 
          ? "bg-muted-foreground/30 border-muted-foreground/20" 
          : (brokerStatus?.connected 
              ? "bg-emerald-500 border-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.4)]" 
              : "bg-amber-500 border-amber-600 shadow-[0_0_8px_rgba(245,158,11,0.4)]")
      )}></span>
      <span class={cn(
        !connection.origin 
          ? "text-muted-foreground/50" 
          : (brokerStatus?.connected 
              ? "text-foreground font-medium truncate max-w-[120px]" 
              : "text-muted-foreground/75")
      )}>
        {brokerStatus?.connected ? displayStatus.text : "broker"}
      </span>
    </div>
  </Popover.Trigger>
  
  <Popover.Content class="w-80 max-h-[85vh] overflow-y-auto p-4 border border-border/80 bg-background/95 backdrop-blur-md shadow-lg rounded-xl scrollbar-none" align="end">
    <div class="grid gap-4">
      <!-- Section 1: Local Connector -->
      <div class="space-y-2 text-xs">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Local Connector</span>
          <span class="font-medium font-mono text-[10px]">
            {#if connection.origin}
              <span class="text-foreground">Connected</span>
            {:else}
              <span class="text-muted-foreground/60">Disconnected</span>
            {/if}
          </span>
        </div>
        
        {#if connection.origin}
          <div class="flex items-center justify-between gap-2 p-1.5 bg-muted/20 border border-border rounded-md">
            <span class="font-mono text-[10px] text-foreground truncate select-all">{connection.origin}</span>
            <Button
              variant="outline"
              class="h-5 px-1.5 text-[10px] cursor-pointer"
              onclick={() => {
                dialogOpen = true;
              }}
            >
              Change
            </Button>
          </div>
        {:else}
          <Button
            variant="outline"
            size="sm"
            class="w-full text-xs cursor-pointer"
            onclick={() => {
              dialogOpen = true;
            }}
          >
            Configure Connector
          </Button>
        {/if}
      </div>

      <!-- Divider -->
      <div class="border-t border-border/60"></div>

      <!-- Section 2: MQTT Broker -->
      <div class="space-y-2 text-xs">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">MQTT Broker</span>
          <span class="font-medium font-mono text-[10px]">
            {#if brokerStatus && brokerStatus.connected}
              <span class="text-foreground">Connected</span>
            {:else}
              <span class="text-muted-foreground/60">Disconnected</span>
            {/if}
          </span>
        </div>

        {#if !connection.origin}
          <!-- Connector is required first -->
          <p class="text-[11px] text-muted-foreground leading-normal">
            Please set up and run the local connector first before connecting to an MQTT broker.
          </p>
        {:else if brokerStatus && brokerStatus.connected}
          <!-- Broker is Connected -->
          <div class="space-y-2.5">
            <div class="p-2 bg-muted/20 border border-border rounded-md space-y-1.5">
              <div class="flex justify-between items-center text-[10px]">
                <span class="text-muted-foreground">URL:</span>
                <span class="font-mono text-foreground select-all truncate max-w-[180px]">{brokerStatus.url}</span>
              </div>
              {#if brokerStatus.clientId}
                <div class="flex justify-between items-center text-[10px]">
                  <span class="text-muted-foreground">Client ID:</span>
                  <span class="font-mono text-foreground select-all truncate max-w-[180px]">{brokerStatus.clientId}</span>
                </div>
              {/if}
            </div>

            <Button
              variant="outline"
              size="sm"
              class="w-full text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50/10 cursor-pointer"
              onclick={disconnectBroker}
            >
              Disconnect Broker
            </Button>
          </div>
        {:else}
          <!-- Broker is Disconnected: Show connection form -->
          <form onsubmit={connectBroker} class="space-y-2.5">
            <!-- Broker URL -->
            <div class="space-y-1">
              <Label for="broker-url" class="text-[10px] text-muted-foreground font-medium">Broker URL</Label>
              <Input
                id="broker-url"
                type="text"
                bind:value={brokerUrl}
                placeholder="mqtt://localhost:1883"
                required
                class="h-7 text-xs border border-border bg-transparent focus:ring-1"
              />
            </div>

            <!-- Client ID -->
            <div class="space-y-1">
              <Label for="broker-client-id" class="text-[10px] text-muted-foreground font-medium">Client ID</Label>
              <Input
                id="broker-client-id"
                type="text"
                bind:value={brokerClientId}
                placeholder="mqtt-radar-client"
                class="h-7 text-xs border border-border bg-transparent focus:ring-1"
              />
            </div>

            <!-- Username (Optional) -->
            <div class="space-y-1">
              <Label for="broker-username" class="text-[10px] text-muted-foreground font-medium">Username (optional)</Label>
              <Input
                id="broker-username"
                type="text"
                bind:value={brokerUsername}
                placeholder="Username"
                class="h-7 text-xs border border-border bg-transparent focus:ring-1"
              />
            </div>

            <!-- Password (Optional) -->
            <div class="space-y-1">
              <Label for="broker-password" class="text-[10px] text-muted-foreground font-medium">Password (optional)</Label>
              <Input
                id="broker-password"
                type="password"
                bind:value={brokerPassword}
                placeholder="••••••••"
                class="h-7 text-xs border border-border bg-transparent focus:ring-1"
              />
            </div>

            <!-- TLS Settings Toggle -->
            <div class="pt-1">
              <button
                type="button"
                onclick={() => showTlsSettings = !showTlsSettings}
                class="text-[10px] text-muted-foreground hover:text-foreground font-mono transition-colors flex items-center gap-1 cursor-pointer select-none"
              >
                <span>{showTlsSettings ? "[-]" : "[+]"} TLS Settings (MQTTS)</span>
              </button>
            </div>

            {#if showTlsSettings}
              <div class="space-y-2.5 p-2 border border-border/80 rounded bg-muted/5 animate-in fade-in slide-in-from-top-1 duration-150">
                <!-- CA Cert -->
                <div class="space-y-1">
                  <Label for="broker-ca" class="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">CA Certificate (PEM)</Label>
                  <textarea
                    id="broker-ca"
                    bind:value={brokerCa}
                    placeholder="-----BEGIN CERTIFICATE-----&#10;..."
                    rows={2}
                    class="w-full p-1.5 font-mono text-[9px] border border-border rounded bg-transparent focus:outline-none focus:ring-1 focus:ring-foreground scrollbar-none resize-y"
                  ></textarea>
                </div>

                <!-- Client Cert -->
                <div class="space-y-1">
                  <Label for="broker-cert" class="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Client Certificate (PEM)</Label>
                  <textarea
                    id="broker-cert"
                    bind:value={brokerCert}
                    placeholder="-----BEGIN CERTIFICATE-----&#10;..."
                    rows={2}
                    class="w-full p-1.5 font-mono text-[9px] border border-border rounded bg-transparent focus:outline-none focus:ring-1 focus:ring-foreground scrollbar-none resize-y"
                  ></textarea>
                </div>

                <!-- Client Key -->
                <div class="space-y-1">
                  <Label for="broker-key" class="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Client Key (PEM)</Label>
                  <textarea
                    id="broker-key"
                    bind:value={brokerKey}
                    placeholder="-----BEGIN PRIVATE KEY-----&#10;..."
                    rows={2}
                    class="w-full p-1.5 font-mono text-[9px] border border-border rounded bg-transparent focus:outline-none focus:ring-1 focus:ring-foreground scrollbar-none resize-y"
                  ></textarea>
                </div>

                <!-- Reject Unauthorized -->
                <div class="flex items-center gap-2 pt-1">
                  <input
                    id="broker-reject-unauthorized"
                    type="checkbox"
                    bind:checked={brokerRejectUnauthorized}
                    class="h-3 w-3 rounded border border-border bg-transparent text-foreground focus:ring-1 focus:ring-foreground accent-foreground cursor-pointer"
                  />
                  <Label for="broker-reject-unauthorized" class="text-[9px] text-muted-foreground cursor-pointer font-medium">
                    Verify Server Certificate
                  </Label>
                </div>
              </div>
            {/if}

            {#if brokerError}
              <p class="text-[10px] text-rose-500 font-mono leading-normal bg-rose-500/5 p-1.5 border border-rose-500/20 rounded">
                {brokerError}
              </p>
            {/if}

            <Button
              type="submit"
              disabled={brokerConnecting}
              class="w-full h-8 text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors cursor-pointer select-none rounded border-0 shadow-none hover:shadow-none"
            >
              {#if brokerConnecting}
                <Loader2 class="mr-1.5 h-3 w-3 animate-spin" />
                Connecting...
              {:else}
                Connect Broker
              {/if}
            </Button>
          </form>
        {/if}
      </div>
    </div>
  </Popover.Content>
</Popover.Root>
