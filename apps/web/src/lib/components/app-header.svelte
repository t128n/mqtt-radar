<script lang="ts">
  import RadarIcon from "@lucide/svelte/icons/radar";
  import ConnectionPopover from "~/lib/components/connection-popover.svelte";

  // Props
  let {
    connection = $bindable({ origin: null }),
    dialogOpen = $bindable(false),
  } = $props();
</script>

<div
  class="px-6 py-3 flex justify-between items-center text-sm border-b border-border/40 bg-background/50 backdrop-blur-sm"
>
  <div class="flex items-center gap-1.5">
    <RadarIcon size="18" class="text-primary" />
    <span class="font-semibold tracking-tight">MQTT Radar</span>
  </div>

  <ConnectionPopover bind:dialogOpen bind:connection />
</div>
