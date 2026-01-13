<script lang="ts">
  import { onMount } from "svelte";
  import type { Agent } from "@atproto/api";
  import {
    type StickerWithProfile,
    getUserStickers,
    loadStickerLikeState,
    toggleStickerLike,
    deleteSticker,
    type LikeState,
  } from "$lib/stickers";
  import { publicAgent } from "$lib/atproto";
  import StickerCanvas from "./StickerCanvas.svelte";
  import { fade } from "svelte/transition";

  let {
    agent,
    targetDid = undefined,
    title = undefined,
  } = $props<{ agent: Agent; targetDid?: string; title?: string }>();
  let stickers = $state<StickerWithProfile[]>([]);
  let likeStates = $state<Map<string, LikeState>>(new Map());
  let loading = $state(true);
  let currentUserProfile = $state<{
    avatar?: string;
    handle?: string;
    displayName?: string;
  } | null>(null);

  // Computed Title
  let displayTitle = $derived(
    title ||
      (targetDid && targetDid !== agent.assertDid ? "Sticker Book" : "My Book"),
  );

  onMount(async () => {
    // If targetDid is provided, use it. Otherwise use agent.assertDid.
    const didToLoad = targetDid || agent.assertDid;
    if (didToLoad) {
      await loadStickers(didToLoad);
    }

    // Load self profile for optimistic UI
    if (agent.assertDid) {
      try {
        const res = await publicAgent.getProfile({ actor: agent.assertDid });
        currentUserProfile = res.data;
      } catch (e) {
        console.warn("Failed to load self profile", e);
      }
    }
  });

  async function loadStickers(did: string) {
    loading = true;
    try {
      if (did) {
        stickers = await getUserStickers(agent, did);
        // Load likes in background
        loadLikes();
      }
    } catch (e) {
      console.error("Failed to load stickers", e);
    } finally {
      loading = false;
    }
  }

  async function loadLikes() {
    for (const s of stickers) {
      loadStickerLikeState(agent, s).then((state) => {
        likeStates.set(s.uri, state);
        likeStates = new Map(likeStates);
      });
    }
  }

  async function handleLike(sticker: StickerWithProfile, e: Event) {
    e.stopPropagation();
    const uri = sticker.uri;
    const current = likeStates.get(uri);

    // Optimistic Update
    const wasLiked = current?.isLiked;
    const currentCount = current?.count || 0;

    // Create new optimistic state
    const optimistic: LikeState = {
      count: wasLiked ? Math.max(0, currentCount - 1) : currentCount + 1,
      isLiked: !wasLiked,
      likers: current?.likers ? [...current.likers] : [],
      uri: current?.uri, // Will be updated with real URI on success if liking
    };

    // Update likers list optimistically
    const myDid = agent.assertDid;
    if (myDid) {
      if (!wasLiked) {
        // Add self
        optimistic.likers.unshift({
          did: myDid,
          avatar: currentUserProfile?.avatar,
          handle: currentUserProfile?.handle,
        });
      } else {
        // Remove self
        optimistic.likers = optimistic.likers.filter((l) => l.did !== myDid);
      }
    }

    likeStates.set(uri, optimistic);
    likeStates = new Map(likeStates);

    try {
      const newLikeUri = await toggleStickerLike(agent, sticker, current?.uri);

      // Update with final state (mainly to set the URI for future unlikes)
      const finalState: LikeState = {
        ...optimistic,
        uri: newLikeUri,
        // If we successfully liked, ensure we have the URI.
        // If unliked, newLikeUri is undefined, which is correct.
      };

      likeStates.set(uri, finalState);
      likeStates = new Map(likeStates);
    } catch (e) {
      console.error("Like failed", e);
      // Revert
      if (current) likeStates.set(uri, current);
      else likeStates.delete(uri);
      likeStates = new Map(likeStates);
    }
  }

  async function handleDelete(sticker: StickerWithProfile, e: Event) {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this sticker?")) return;

    try {
      await deleteSticker(agent, sticker.uri);
      // Remove from list
      stickers = stickers.filter((s) => s.uri !== sticker.uri);
    } catch (e) {
      alert("Failed to delete sticker");
    }
  }
</script>

<div class="space-y-8">
  {#if loading}
    <div class="text-center py-12">
      <div
        class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"
      ></div>
      <p class="text-gray-500">Opening sticker book...</p>
    </div>
  {:else if stickers.length === 0}
    <div class="card-glass border-dashed border-primary/30 p-12 text-center">
      <h3 class="text-xl font-bold text-gray-700 mb-2">{displayTitle}</h3>
      <p class="text-gray-500">No stickers yet! ✨</p>
      {#if !targetDid || targetDid === agent.assertDid}
        <button
          onclick={() => loadStickers(agent.assertDid!)}
          class="mt-4 px-6 py-2 bg-secondary/20 hover:bg-secondary/40 text-gray-700 rounded-full font-bold transition-colors"
          >Refresh</button
        >
      {/if}
    </div>
  {:else}
    <div
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
    >
      {#each stickers as sticker (sticker.uri)}
        <div class="sticker-card-interactive">
          <!-- 3D Sticker -->
          <div class="aspect-square w-full mb-2 max-w-[160px] mx-auto">
            <StickerCanvas
              avatarUrl={typeof sticker.image === "string" ? sticker.image : ""}
            />
          </div>

          <!-- Metadata -->
          <div class="text-center space-y-1">
            <!-- Depicted (Sticker Name) -->
            <!-- Depicted (Sticker Name) -->
            <p class="font-bold text-gray-700 truncate text-sm">
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
            {#if sticker.giverProfile && sticker.obtainedFrom}
              <p class="text-xs text-gray-500 truncate">
                From: <a
                  href="/profile/{sticker.obtainedFrom}"
                  class="text-primary hover:underline relative z-10"
                  onclick={(e) => e.stopPropagation()}
                >
                  {sticker.giverProfile?.displayName ||
                    sticker.giverProfile?.handle ||
                    sticker.obtainedFrom}
                </a>
              </p>
            {/if}

            <!-- Original Owner (Minter) -->
            {#if sticker.originalOwnerProfile || sticker.originalOwner}
              <p class="text-xs text-gray-400 truncate">
                Minter: <a
                  href="/profile/{sticker.originalOwner}"
                  class="text-primary hover:underline relative z-10"
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

            <!-- Like Section -->
            <div class="pt-2 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <button
                  onclick={(e) => handleLike(sticker, e)}
                  class="p-1 rounded-full hover:bg-gray-50 transition-colors relative z-20 group/btn"
                  title={likeStates.get(sticker.uri)?.isLiked
                    ? "Unlike"
                    : "Like"}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 transition-transform active:scale-95 {likeStates.get(
                      sticker.uri,
                    )?.isLiked
                      ? 'text-primary fill-current'
                      : 'text-gray-300 group-hover/btn:text-primary'}"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                    fill="none"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                </button>

                <!-- Likers Avatars -->
                {#if likeStates.get(sticker.uri)?.likers.length}
                  <div class="flex -space-x-2 relative z-20">
                    {#each likeStates
                      .get(sticker.uri)!
                      .likers.slice(0, 3) as liker}
                      <a
                        href="/profile/{liker.did}"
                        onclick={(e) => e.stopPropagation()}
                        class="block relative hover:z-30 transition-transform hover:scale-110"
                        title={liker.handle || "Liker"}
                      >
                        {#if liker.avatar}
                          <img
                            src={liker.avatar}
                            alt="Liker"
                            class="w-5 h-5 rounded-full border border-white ring-1 ring-gray-100 object-cover bg-gray-200"
                          />
                        {:else}
                          <div
                            class="w-5 h-5 rounded-full border border-white ring-1 ring-gray-100 bg-gray-300 flex items-center justify-center text-[8px] text-white"
                          >
                            ?
                          </div>
                        {/if}
                      </a>
                    {/each}
                    {#if (likeStates.get(sticker.uri)?.count || 0) > 3}
                      <span class="text-[10px] text-gray-400 pl-2"
                        >+{(likeStates.get(sticker.uri)?.count || 0) - 3}</span
                      >
                    {/if}
                  </div>
                {/if}
              </div>

              <!-- Delete Button (Only if owner) -->
              {#if !targetDid || targetDid === agent.assertDid}
                <button
                  class="p-1 text-gray-300 hover:text-red-500 transition-colors z-20"
                  title="Delete Sticker"
                  onclick={(e) => handleDelete(sticker, e)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              {/if}
            </div>
          </div>

          <!-- Detail View Action (Example) -->
        </div>
      {/each}
    </div>
  {/if}
</div>
