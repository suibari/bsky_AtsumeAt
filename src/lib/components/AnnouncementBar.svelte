<script lang="ts">
  import { fade, fly } from "svelte/transition";

  let {
    mainText = "READY TO COLLECT",
    subText = "",
    visible = false,
  } = $props();
</script>

{#if visible}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
    transition:fade={{ duration: 200 }}
  >
    <!-- Background overlay -->
    <div class="absolute inset-0 bg-white/30 backdrop-blur-sm"></div>

    <!-- The Bar Container -->
    <div
      class="relative w-full py-24 overflow-hidden flex flex-col items-center justify-center bg-white/90 shadow-sm"
      in:fly={{ y: 20, duration: 600 }}
      out:fly={{ y: -20, duration: 600 }}
    >
      <!-- Main Text -->
      <h1
        class="text-4xl md:text-6xl font-black tracking-widest text-primary mb-4"
      >
        {mainText}
      </h1>

      <!-- Sub Text -->
      {#if subText}
        <p class="text-gray-400 font-medium tracking-[0.2em] text-sm uppercase">
          {subText}
        </p>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Removed stroke usage */
</style>
