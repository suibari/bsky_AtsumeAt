<script lang="ts">
  import { onMount } from "svelte";
  import type { Agent } from "@atproto/api";
  import { getUserStickers, type StickerWithProfile } from "$lib/game";
  import StickerCanvas from "./StickerCanvas.svelte";

  let { agent } = $props<{ agent: Agent }>();
  let stickers = $state<StickerWithProfile[]>([]);
  let loading = $state(true);

  onMount(async () => {
    if (agent.assertDid) {
      await loadStickers();
    }
  });

  async function loadStickers() {
    loading = true;
    try {
      if (agent.assertDid) {
        stickers = await getUserStickers(agent, agent.assertDid);
      }
    } catch (e) {
      console.error("Failed to load stickers", e);
    } finally {
      loading = false;
    }
  }
</script>

<div class="space-y-8">
  {#if loading}
    <div class="text-center py-12">
      <div
        class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"
      ></div>
      <p class="text-gray-500">Opening your sticker book...</p>
    </div>
  {:else if stickers.length === 0}
    <div
      class="text-center p-8 bg-white rounded-xl shadow-sm border border-gray-100"
    >
      <h3 class="text-xl font-bold text-gray-800 mb-2">My Book</h3>
      <p class="text-gray-500">
        No stickers yet! Wait a moment if you just joined...
      </p>
      <button
        onclick={loadStickers}
        class="mt-4 text-primary font-medium hover:underline">Refresh</button
      >
    </div>
  {:else}
    <div
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6"
    >
      {#each stickers as sticker (sticker.uri)}
        <div
          class="relative bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition border border-gray-100 group"
        >
          <!-- 3D Sticker -->
          <div class="h-40 w-full mb-2">
            <StickerCanvas
              avatarUrl={sticker.profile?.avatar}
              shiny={sticker.shiny}
            />
          </div>

          <!-- Metadata -->
          <div class="text-center">
            <p class="font-bold text-gray-800 truncate text-sm">
              {sticker.profile?.displayName ||
                sticker.profile?.handle ||
                "Unknown"}
            </p>
            {#if sticker.shiny}
              <span
                class="inline-block bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full mt-1"
                >Shiny!</span
              >
            {/if}
            <p class="text-xs text-gray-400 mt-1">
              {new Date(sticker.obtainedAt).toLocaleDateString()}
            </p>
          </div>

          <!-- Detail View Action (Example) -->
          <button
            class="absolute inset-0 w-full h-full cursor-pointer focus:outline-none"
            aria-label="View Sticker"
          ></button>
        </div>
      {/each}
    </div>
  {/if}
</div>
