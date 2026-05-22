<script lang="ts">
  import * as Dialog from "~/lib/components/ui/dialog/index.js";
  import { Button } from "~/lib/components/ui/button/index.js";
  import { Input } from "~/lib/components/ui/input/index.js";
  import { Label } from "~/lib/components/ui/label/index.js";
  import * as Tabs from "~/lib/components/ui/tabs/index.js";
  import { verifyPairing } from "~/lib/mqtt-radar";

  // Icons
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
  import Loader2 from "@lucide/svelte/icons/loader-2";

  // Props
  let { open = $bindable(false) } = $props();

  // State
  let copied = $state(false);
  let connecting = $state(false);
  let connectionError = $state<string | null>(null);

  let origin = $state("http://127.0.0.1:3881");

  // Tabs State & Commands
  let activeTab = $state("pnpm");
  const commands = {
    pnpm: "pnpm dlx github:t128n/mqtt-radar",
    npx: "npx -y github:t128n/mqtt-radar",
    deno: "deno run -A npm:github:t128n/mqtt-radar",
    bun: "bunx github:t128n/mqtt-radar",
  };
  
  let command = $derived(commands[activeTab as keyof typeof commands] || commands.pnpm);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy command:", err);
    }
  }

  async function handleConnect(e: SubmitEvent) {
    e.preventDefault();
    connecting = true;
    connectionError = null;
    
    try {
      const isValid = await verifyPairing(origin);
      if (isValid) {
        localStorage.setItem("mqtt_radar_connector_origin", origin);
        connecting = false;
        open = false;
        
        // Reload parent state
        window.location.reload();
      } else {
        connectionError = "Failed to connect. Make sure the local connector is running and reachable.";
        connecting = false;
      }
    } catch (err: any) {
      connectionError = err.message || "Failed to establish connection.";
      connecting = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg p-8 rounded-lg border border-border bg-background shadow-md" showCloseButton={true}>
    <Dialog.Header class="space-y-1.5 text-left mb-6">
      <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">Connect to MQTT Radar</Dialog.Title>
      <Dialog.Description class="text-muted-foreground text-xs leading-normal">
        MQTT Radar runs in your browser, but requires a local connector to interface with your MQTT brokers securely.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-6">
      <!-- Step 1: Run the command -->
      <div class="space-y-3">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-foreground">
          1. Run local connector
        </h3>
        
        <p class="text-xs text-muted-foreground">
          Start the connector using your preferred package manager or runtime in your shell.
        </p>

        <!-- Tabs Selector -->
        <Tabs.Root bind:value={activeTab} class="w-full">
          <Tabs.List variant="line" class="w-full mb-3">
            <Tabs.Trigger value="pnpm">pnpm</Tabs.Trigger>
            <Tabs.Trigger value="npx">npx</Tabs.Trigger>
            <Tabs.Trigger value="deno">deno</Tabs.Trigger>
            <Tabs.Trigger value="bun">bun</Tabs.Trigger>
          </Tabs.List>

          {#snippet codeBlock(cmd)}
            <div class="relative flex items-center justify-between p-3 bg-muted/30 border border-border rounded-md font-mono text-[11px] text-foreground group">
              <span class="select-all overflow-x-auto whitespace-nowrap scrollbar-none pr-10">{cmd}</span>
              
              <button
                type="button"
                onclick={handleCopy}
                class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Copy command to clipboard"
              >
                {#if copied}
                  <Check class="h-3.5 w-3.5 text-foreground animate-in fade-in duration-200" />
                {:else}
                  <Copy class="h-3.5 w-3.5" />
                {/if}
              </button>
            </div>
          {/snippet}

          <Tabs.Content value="pnpm" class="focus-visible:outline-none">
            {@render codeBlock(commands.pnpm)}
          </Tabs.Content>
          <Tabs.Content value="npx" class="focus-visible:outline-none">
            {@render codeBlock(commands.npx)}
          </Tabs.Content>
          <Tabs.Content value="deno" class="focus-visible:outline-none">
            {@render codeBlock(commands.deno)}
          </Tabs.Content>
          <Tabs.Content value="bun" class="focus-visible:outline-none">
            {@render codeBlock(commands.bun)}
          </Tabs.Content>
        </Tabs.Root>
      </div>

      <!-- Precise thin Divider -->
      <div class="border-t border-border/60 my-5"></div>

      <!-- Step 2: Connection details form -->
      <form onsubmit={handleConnect} class="space-y-4">
        <div class="space-y-4">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-foreground">
            2. Enter URL
          </h3>
          
          <!-- Connector URL -->
          <div class="space-y-1.5">
            <Label for="connector-url" class="text-xs text-muted-foreground font-medium">
              Connector URL
            </Label>
            <Input
              id="connector-url"
              type="url"
              bind:value={origin}
              placeholder="http://127.0.0.1:3881"
              required
              class="h-8 text-xs focus:ring-1 border border-border rounded-md bg-transparent"
            />
          </div>

          {#if connectionError}
            <p class="text-[10px] text-rose-500 font-mono leading-normal bg-rose-500/5 p-1.5 border border-rose-500/20 rounded">
              {connectionError}
            </p>
          {/if}
        </div>

        <Dialog.Footer class="bg-transparent border-t-0 p-0 pt-3 m-0 rounded-none">
          <Button
            type="submit"
            disabled={connecting}
            class="w-full h-9 text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors cursor-pointer select-none rounded-md border-0 shadow-none hover:shadow-none"
          >
            {#if connecting}
              <Loader2 class="mr-2 h-3.5 w-3.5 animate-spin" />
              Pairing with Connector...
            {:else}
              Establish Connection
            {/if}
          </Button>
        </Dialog.Footer>
      </form>
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  .scrollbar-none::-webkit-scrollbar {
    display: none;
  }
  .scrollbar-none {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
