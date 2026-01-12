<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { getClient, getPdsEndpoint } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import type { ProfileViewBasic } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
  import {
    acceptExchange,
    getUserStickers,
    createExchangePost,
    fetchStickersForTransaction,
  } from "$lib/game";
  import {
    STICKER_COLLECTION,
    type Sticker,
    TRANSACTION_COLLECTION,
    type Transaction,
  } from "$lib/schemas";
  import type { StickerWithProfile } from "$lib/game";
  import Landing from "$lib/components/Landing.svelte";
  import StickerCanvas from "$lib/components/StickerCanvas.svelte";

  let agent = $state<Agent | null>(null);
  let targetUserParam = $derived($page.url.searchParams.get("user"));
  let loading = $state(true);
  let verifying = $state(false);
  let isValidOffer = $state(false);
  let processing = $state(false);
  let incomingStickers = $state<Sticker[]>([]);

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

  // Settings
  let mentionOnBluesky = $state(true);
  let saveSettings = $state(false);

  onMount(async () => {
    // Load Settings
    const savedMention = localStorage.getItem("mentionOnBluesky");
    if (savedMention !== null) {
      mentionOnBluesky = savedMention === "true";
      saveSettings = true; // If we found settings, assume user wanted them saved (or just default checkbox to true if previously saved?)
      // Let's just restore the value. Should we restore the "saveSettings" checkbox state?
      // Usually "save settings" is an action or persistently checked. Let's make it checked if we loaded something.
      saveSettings = true;
    }

    const c = getClient();
    if (c) {
      const res = await c.init();
      if (res) {
        agent = new Agent(res.session);

        // Always fetch stickers if logged in
        if (agent.assertDid) {
          myStickers = await getUserStickers(agent, agent.assertDid);
        }

        // Verify Offer if targetUserParam exists
        if (targetUserParam) {
          await verifyIncomingOffer(targetUserParam);
        }
      }
    }
    loading = false;
  });

  async function verifyIncomingOffer(did: string) {
    if (!agent || !agent.assertDid) return;
    verifying = true;
    isValidOffer = false;

    // 1. Basic DID check
    if (!did.startsWith("did:")) {
      verifying = false;
      return;
    }

    // 2. Resolve PDS (Robust Cross-PDS)
    let pdsAgent = agent;
    const pdsUrl = await getPdsEndpoint(did);
    if (pdsUrl) {
      // Create unauthenticated agent for that PDS
      pdsAgent = new Agent(pdsUrl);
    }

    // 3. Query Repo for Offer
    try {
      const res = await pdsAgent.com.atproto.repo.listRecords({
        repo: did, // Now hitting the correct PDS
        collection: TRANSACTION_COLLECTION,
        limit: 10,
      });

      // We must reconstruct the Agent if valid because pdsAgent might be unauthed?
      // Actually we just need to verify the record exists.

      const offer = res.data.records.find((r) => {
        const t = r.value as unknown as Transaction;
        // Verify target matches ME (My Agent's DID)
        return t.partner === agent!.assertDid && t.status === "offered";
      });

      if (offer) {
        isValidOffer = true;
        incomingStickers = await fetchStickersForTransaction(
          agent!,
          offer.value as unknown as Transaction,
          did,
        );
      }
    } catch (e) {
      console.error("Failed to verify offer", e);
      // Fallback: If pdsAgent failed, maybe main agent works? (Unlikely if different PDS)
    } finally {
      verifying = false;
    }
  }

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

    if (saveSettings) {
      localStorage.setItem("mentionOnBluesky", String(mentionOnBluesky));
    } else {
      localStorage.removeItem("mentionOnBluesky");
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
        mentionOnBluesky, // Pass flag
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
    if (selectedStickers.size === 0) {
      alert("Please select at least one sticker to give in return.");
      return;
    }

    processing = true;
    try {
      await acceptExchange(
        agent,
        targetUserParam,
        Array.from(selectedStickers),
      );
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
    {#if verifying}
      <div class="text-center mt-20">
        <div
          class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"
        ></div>
        <p class="text-gray-500">Verifying exchange offer...</p>
      </div>
    {:else if isValidOffer}
      {#if successAccept}
        <div class="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md">
          <h2 class="text-3xl font-bold text-green-500 mb-4">
            Exchange Accepted!
          </h2>
          <p class="text-gray-600 mb-8">
            You have received new stickers and sent yours back!
          </p>
          <a
            href="/"
            class="bg-primary text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-600 transition"
            >View My Book</a
          >
        </div>
      {:else}
        <div
          class="bg-white p-8 rounded-2xl shadow-xl max-w-2xl text-center w-full"
        >
          <h2 class="text-2xl font-bold mb-2">Incoming Offer!</h2>
          <p class="text-gray-600 mb-6">
            User <span class="font-mono bg-gray-100 px-1 rounded"
              >{targetUserParam}</span
            > wants to swap.
          </p>

          {#if incomingStickers.length > 0}
            <div class="mb-6 text-left">
              <h3 class="text-lg font-bold mb-2">
                You will receive ({incomingStickers.length})
              </h3>
              <div
                class="flex gap-2 overflow-x-auto min-h-[160px] p-2 bg-gray-50 rounded-xl"
              >
                {#each incomingStickers as s}
                  <div class="w-32 h-32 flex-shrink-0 relative">
                    <StickerCanvas
                      avatarUrl={typeof s.image === "string" ? s.image : ""}
                      staticAngle={true}
                    />
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <div class="mb-6 text-left">
            <h3 class="text-lg font-bold mb-2">
              Select Stickers to Give Back ({selectedStickers.size})
            </h3>

            {#if myStickers.length === 0}
              <p class="text-gray-500 italic text-center py-4">
                You have no stickers to give! Go collect some first.
              </p>
            {:else}
              <div
                class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[300px] overflow-y-auto p-4 border rounded-xl bg-gray-50"
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
                    <div class="h-24 w-full">
                      <StickerCanvas
                        avatarUrl={typeof sticker.image === "string"
                          ? sticker.image
                          : ""}
                        staticAngle={true}
                      />
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
                      class="p-1 text-center text-xs text-gray-500 truncate border-t border-gray-50"
                    >
                      {#if sticker.imageType === "custom"}
                        {sticker.description ||
                          sticker.profile?.displayName ||
                          sticker.profile?.handle ||
                          "Unknown"}
                      {:else}
                        {sticker.profile?.displayName ||
                          sticker.profile?.handle ||
                          "Unknown"}
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <div class="flex justify-center space-x-4">
            <a
              href="/"
              class="px-4 py-2 text-gray-500 hover:text-gray-700 self-center"
              >Cancel</a
            >
            <button
              onclick={handleAccept}
              disabled={processing || selectedStickers.size === 0}
              class="bg-secondary text-white font-bold py-3 px-8 rounded-full hover:shadow-lg transition transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? "Exchanging..." : "Exchange Stickers!"}
            </button>
          </div>
        </div>
      {/if}
    {:else}
      <!-- Invalid Offer -->
      <div class="bg-white p-8 rounded-2xl shadow-xl max-w-md text-center">
        <h2 class="text-xl font-bold text-red-500 mb-4">Invalid Link</h2>
        <p class="text-gray-600 mb-6">
          The exchange link is invalid, expired, or the user did not make an
          offer for you.
        </p>
        <a
          href="/exchange"
          class="bg-gray-100 text-gray-700 font-bold py-2 px-6 rounded-lg hover:bg-gray-200"
        >
          Start New Exchange
        </a>
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
                    <StickerCanvas avatarUrl={sticker.image as string} />
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

        <div class="flex flex-col gap-2 mb-4 justify-end items-end">
          <label
            class="flex items-center gap-2 cursor-pointer text-sm text-gray-700"
          >
            <input
              type="checkbox"
              bind:checked={mentionOnBluesky}
              class="rounded text-primary focus:ring-primary"
            />
            Mention on Bluesky
          </label>
          <label
            class="flex items-center gap-2 cursor-pointer text-sm text-gray-500"
          >
            <input
              type="checkbox"
              bind:checked={saveSettings}
              class="rounded text-gray-500 focus:ring-gray-400"
            />
            Save Settings
          </label>
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
