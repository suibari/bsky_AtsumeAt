<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getClient } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import {
    checkIncomingOffers,
    acceptExchange,
    type IncomingOffer,
  } from "$lib/game";
  import StickerCanvas from "$lib/components/StickerCanvas.svelte";
  import { fade, slide } from "svelte/transition";

  let agent = $state<Agent | null>(null);
  let loading = $state(true);
  let offers = $state<IncomingOffer[]>([]);
  let processing = $state<string | null>(null); // DID being processed
  let message = $state<string | null>(null);

  onMount(async () => {
    const c = getClient();
    if (c) {
      const res = await c.init();
      if (res) {
        agent = new Agent(res.session);
        await loadOffers();
      }
    }
    loading = false;
  });

  async function loadOffers() {
    if (!agent) return;
    offers = await checkIncomingOffers(agent);
    // Mark as read (update timestamp)
    localStorage.setItem("lastCheckedNotificationAt", new Date().toISOString());
  }

  async function handleAccept(offer: IncomingOffer) {
    if (!agent) return;
    // Redirect to Exchange page with partner's DID
    window.location.href = `/exchange?user=${offer.partnerDid}`;
  }
</script>

<div class="min-h-screen bg-surface">
  <div class="max-w-6xl mx-auto p-4 md:p-8">
    <header class="mb-6 flex items-center gap-2">
      <a href="/" class="p-2 rounded-full hover:bg-white text-gray-500">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          />
        </svg>
      </a>
      <h1 class="text-xl font-bold text-gray-800">Notifications</h1>
    </header>

    {#if loading}
      <div class="flex justify-center p-8">
        <div
          class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
        ></div>
      </div>
    {:else if offers.length === 0}
      <div
        class="text-center p-8 text-gray-500 bg-white rounded-xl border border-gray-100"
      >
        <p>No new exchange offers.</p>
      </div>
    {:else}
      <div class="space-y-4">
        {#each offers as offer (offer.uri)}
          <div
            class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between"
            transition:slide
          >
            <div class="flex items-center gap-3">
              {#if offer.profile?.avatar}
                <img
                  src={offer.profile.avatar}
                  alt="Avatar"
                  class="w-12 h-12 rounded-full object-cover border border-gray-200"
                />
              {:else}
                <div
                  class="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-xl"
                >
                  ?
                </div>
              {/if}
              <div>
                <h3 class="font-bold text-gray-800">
                  {offer.profile?.displayName ||
                    offer.profile?.handle ||
                    offer.partnerDid}
                </h3>
                <p class="text-sm text-gray-500">
                  Wants to send you <span class="font-bold text-primary"
                    >{offer.offer.stickerOut?.length || 0}</span
                  > stickers.
                </p>
              </div>
              <!-- Stickers Preview -->
              {#if offer.stickers && offer.stickers.length > 0}
                <div class="flex gap-2 ml-4 overflow-x-auto min-h-[64px]">
                  {#each offer.stickers as s}
                    <div class="w-16 h-16 flex-shrink-0">
                      <StickerCanvas
                        avatarUrl={typeof s.image === "string" ? s.image : ""}
                        staticAngle={true}
                      />
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <button
              onclick={() => handleAccept(offer)}
              disabled={!!processing}
              class="bg-primary text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-primary/90 transition disabled:opacity-50"
            >
              {#if processing === offer.partnerDid}
                ...
              {:else}
                Accept
              {/if}
            </button>
          </div>
        {/each}
      </div>
    {/if}

    {#if message}
      <div
        class="fixed bottom-4 left-4 right-4 bg-gray-800 text-white p-3 rounded-lg text-center shadow-lg z-50"
        transition:fade
      >
        {message}
      </div>
    {/if}
  </div>
</div>
