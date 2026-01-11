<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { getClient } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import type { ProfileViewBasic } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
  import {
    acceptExchange,
    getUserStickers,
    createExchangePost,
  } from "$lib/game";
  import { STICKER_COLLECTION, type Sticker } from "$lib/schemas";
  import type { StickerWithProfile } from "$lib/game";
  import Landing from "$lib/components/Landing.svelte";
  import StickerCanvas from "$lib/components/StickerCanvas.svelte";

  let agent = $state<Agent | null>(null);
  let targetUserParam = $derived($page.url.searchParams.get("user"));
  let loading = $state(true);
  let processing = $state(false);

  // Accept Mode State
  let successAccept = $state(false);

  // Initiate Mode State
  let partnerHandle = $state("");
  let partnerDid = $state<string | null>(null);
  let myStickers = $state<StickerWithProfile[]>([]);
  let selectedStickers = $state<Set<string>>(new Set()); // URIs
  let resolveError = $state("");
  let searchResults = $state<ProfileViewBasic[]>([]);
  let showDropdown = $state(false);
  let searchTimeout: ReturnType<typeof setTimeout>;

  onMount(async () => {
    const c = getClient();
    if (c) {
      const res = await c.init();
      if (res) {
        agent = new Agent(res.session);
        // If initiate mode, fetch stickers
        if (!targetUserParam && agent.assertDid) {
          myStickers = await getUserStickers(agent, agent.assertDid);
        }
      }
    }
    loading = false;
  });

  function handleInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    partnerHandle = value;
    partnerDid = null; // Reset selection
    resolveError = "";
    showDropdown = true;

    clearTimeout(searchTimeout);
    if (!value) {
      searchResults = [];
      return;
    }

    searchTimeout = setTimeout(async () => {
      if (!agent) return;
      try {
        const res = await agent.searchActorsTypeahead({
          term: value,
          limit: 5,
        });
        searchResults = res.data.actors;
      } catch (e) {
        console.error(e);
      }
    }, 300);
  }

  function selectUser(user: ProfileViewBasic) {
    partnerHandle = user.handle;
    partnerDid = user.did;
    showDropdown = false;
    searchResults = [];
  }

  // Check Partner Handle (Manual fallback)
  async function resolvePartner() {
    if (!agent || !partnerHandle) return;
    resolveError = "";
    showDropdown = false;
    try {
      const res = await agent.resolveHandle({ handle: partnerHandle });
      partnerDid = res.data.did;
    } catch (e) {
      resolveError = "User not found.";
      partnerDid = null;
    }
  }

  function toggleSticker(uri: string) {
    if (selectedStickers.has(uri)) {
      selectedStickers.delete(uri);
    } else {
      selectedStickers.add(uri);
    }
    selectedStickers = new Set(selectedStickers); // Reassign for reactivity
  }

  // Handle Initiate (Send Offer)
  async function handleInitiate() {
    if (!agent || !partnerDid) return;
    if (selectedStickers.size === 0) {
      alert("Please select at least one sticker.");
      return;
    }

    processing = true;
    try {
      const stickersToSend = myStickers.filter((s) =>
        selectedStickers.has(s.uri),
      );
      await createExchangePost(
        agent,
        partnerHandle,
        partnerDid,
        stickersToSend,
      );
      alert("Exchange offer sent!");
      window.location.href = "/";
    } catch (e) {
      console.error(e);
      alert("Failed to send offer.");
    } finally {
      processing = false;
    }
  }

  // Handle Accept
  async function handleAccept() {
    if (!agent || !targetUserParam) return;
    processing = true;
    try {
      await acceptExchange(agent, targetUserParam);
      successAccept = true;
    } catch (e) {
      console.error("Exchange failed", e);
      alert("Failed to accept exchange. See console.");
    } finally {
      processing = false;
    }
  }
</script>

<div class="min-h-screen bg-surface flex flex-col items-center p-4">
  <header class="w-full max-w-4xl flex justify-between items-center mb-8">
    <a href="/" class="text-gray-500 hover:text-primary">← Back to Book</a>
    <h1 class="text-2xl font-bold text-primary">Exchange Center</h1>
    <div class="w-20"></div>
  </header>

  {#if loading}
    <div
      class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mt-20"
    ></div>
  {:else if !agent}
    <div class="bg-white p-8 rounded-2xl shadow-xl max-w-md text-center">
      <h2 class="text-2xl font-bold mb-4">Sign In Required</h2>
      <p class="mb-6 text-gray-600">You need to sign in to exchange!</p>
      <Landing />
    </div>
  {:else if targetUserParam}
    <!-- ACCEPT MODE -->
    {#if successAccept}
      <div class="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md">
        <h2 class="text-3xl font-bold text-green-500 mb-4">
          Exchange Accepted!
        </h2>
        <p class="text-gray-600 mb-8">
          You have received a new sticker and sent one back!
        </p>
        <a
          href="/"
          class="bg-primary text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-600 transition"
          >View My Book</a
        >
      </div>
    {:else}
      <div class="bg-white p-8 rounded-2xl shadow-xl max-w-md text-center">
        <h2 class="text-2xl font-bold mb-2">Incoming Offer!</h2>
        <p class="text-gray-600 mb-6">
          User <span class="font-mono bg-gray-100 px-1 rounded"
            >{targetUserParam}</span
          > wants to swap.
        </p>
        <div class="flex justify-center space-x-4">
          <a href="/" class="px-4 py-2 text-gray-500 hover:text-gray-700"
            >Cancel</a
          >
          <button
            onclick={handleAccept}
            disabled={processing}
            class="bg-secondary text-white font-bold py-3 px-8 rounded-full hover:shadow-lg transition transform active:scale-95 disabled:opacity-50"
          >
            {processing ? "Exchanging..." : "Accept Exchange!"}
          </button>
        </div>
      </div>
    {/if}
  {:else}
    <!-- INITIATE MODE -->
    <div class="w-full max-w-4xl bg-white rounded-2xl shadow-xl p-6 relative">
      <h2 class="text-xl font-bold mb-4">Start New Exchange</h2>

      <!-- 1. Select Partner -->
      <div class="mb-6 relative z-10">
        <label class="block text-sm font-medium text-gray-700 mb-1"
          >Partner Handle</label
        >
        <div class="flex gap-2">
          <input
            value={partnerHandle}
            oninput={handleInput}
            placeholder="Search user e.g. suibari"
            class="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary outline-none"
          />
          <button
            onclick={resolvePartner}
            class="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg font-medium text-gray-700"
          >
            Check
          </button>
        </div>

        <!-- Typeahead Results -->
        {#if showDropdown && searchResults.length > 0}
          <div
            class="absolute top-FULL left-0 w-full bg-white border border-gray-200 rounded-lg shadow-xl mt-1 max-h-60 overflow-y-auto"
          >
            {#each searchResults as user}
              <button
                class="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2 border-b last:border-b-0"
                onclick={() => selectUser(user)}
              >
                {#if user.avatar}
                  <img
                    src={user.avatar}
                    alt={user.handle}
                    class="w-6 h-6 rounded-full"
                  />
                {:else}
                  <div class="w-6 h-6 rounded-full bg-gray-200"></div>
                {/if}
                <div>
                  <div class="font-bold text-sm">
                    {user.displayName || user.handle}
                  </div>
                  <div class="text-xs text-gray-500">@{user.handle}</div>
                </div>
              </button>
            {/each}
          </div>
        {/if}

        {#if resolveError}<p class="text-red-500 text-sm mt-1">
            {resolveError}
          </p>{/if}
        {#if partnerDid}<p class="text-green-600 text-sm mt-1">
            Selected: {partnerHandle}
          </p>{/if}
      </div>

      <!-- 2. Select Stickers -->
      {#if partnerDid}
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-2"
            >Select Stickers to Offer ({selectedStickers.size})</label
          >
          {#if myStickers.length === 0}
            <p class="text-gray-500 italic">
              You assume to have stickers, but you have none...
            </p>
          {:else}
            <div
              class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-[500px] overflow-y-auto p-4 border rounded-xl bg-gray-50"
            >
              {#each myStickers as sticker}
                <div
                  class="relative cursor-pointer transition-transform transform hover:scale-105 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
                  onclick={() => toggleSticker(sticker.uri)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) =>
                    e.key === "Enter" && toggleSticker(sticker.uri)}
                >
                  <div class="h-32 w-full">
                    <StickerCanvas avatarUrl={sticker.profile?.avatar || ""} />
                  </div>
                  {#if selectedStickers.has(sticker.uri)}
                    <div
                      class="absolute inset-0 bg-primary/10 border-4 border-primary rounded-xl flex items-start justify-end p-2"
                    >
                      <span
                        class="bg-primary text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-sm"
                        >✓</span
                      >
                    </div>
                  {/if}
                  <div
                    class="p-2 text-center text-xs text-gray-500 truncate border-t border-gray-50"
                  >
                    {sticker.profile?.displayName || "Unknown"}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <div class="flex justify-end">
          <button
            onclick={handleInitiate}
            disabled={processing || selectedStickers.size === 0}
            class="bg-secondary text-white font-bold py-3 px-8 rounded-full hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? "Sending..." : "Create Offer Post"}
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>
