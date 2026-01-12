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
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
    >
      {#each stickers as sticker (sticker.uri)}
        <div
          class="relative bg-white rounded-2xl p-2 shadow-sm hover:shadow-md transition border border-gray-100 group"
        >
          <!-- 3D Sticker -->
          <div class="h-40 w-full mb-2">
            <StickerCanvas avatarUrl={sticker.image as string} />
          </div>

          <!-- Metadata -->
          <div class="text-center space-y-1">
            <!-- Depicted (Sticker Name/Topic) -->
            <!-- Depicted (Sticker Name) -->
            <p class="font-bold text-gray-800 truncate text-sm">
              {#if sticker.imageType === "custom"}
                {sticker.name ||
                  `${sticker.originalOwnerProfile?.displayName || sticker.originalOwnerProfile?.handle || sticker.originalOwner || "Unknown"}のシール`}
              {:else}
                {sticker.profile?.displayName ||
                  sticker.profile?.handle ||
                  "Unknown"}のシール
              {/if}
            </p>

            <!-- Giver -->
            {#if sticker.giverProfile || sticker.obtainedFrom}
              <p class="text-xs text-gray-500 truncate relative z-10">
                <span class="font-semibold">From:</span>
                <a
                  href={`https://bsky.app/profile/${sticker.obtainedFrom}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="hover:underline text-primary"
                  onclick={(e) => e.stopPropagation()}
                >
                  {sticker.giverProfile?.displayName ||
                    sticker.giverProfile?.handle ||
                    sticker.obtainedFrom}
                </a>
              </p>
            {/if}

            <!-- Original Issuer -->
            {#if sticker.originalOwnerProfile || sticker.originalOwner}
              <p class="text-xs text-gray-400 truncate relative z-10">
                <span class="font-semibold">Minter:</span>
                <a
                  href={`https://bsky.app/profile/${sticker.originalOwner}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="hover:underline text-primary"
                  onclick={(e) => e.stopPropagation()}
                >
                  {sticker.originalOwnerProfile?.displayName ||
                    sticker.originalOwnerProfile?.handle ||
                    sticker.originalOwner}
                </a>
              </p>
            {/if}

            <p class="text-[10px] text-gray-300">
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
