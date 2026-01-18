<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getClient } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import {
    checkIncomingOffers,
    rejectExchange,
    type IncomingOffer,
  } from "$lib/exchange";
  import { settings } from "$lib/settings.svelte";
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
  }

  async function handleAccept(offer: IncomingOffer) {
    if (!agent) return;
    // Redirect to Exchange page with partner's DID
    window.location.href = `/exchange?user=${offer.partnerDid}`;
  }

  async function handleReject(offer: IncomingOffer) {
    if (!agent) return;
    if (!confirm(settings.t.exchange.rejectConfirm)) return;

    processing = offer.partnerDid;
    try {
      await rejectExchange(agent, offer.partnerDid, offer.uri);
      // Remove from list
      offers = offers.filter((o) => o.uri !== offer.uri);
      message = settings.t.exchange.rejectedTitle;
      setTimeout(() => (message = null), 3000);
    } catch (e) {
      console.error("Rejection failed", e);
      alert("Failed to reject. See console.");
    } finally {
      processing = null;
    }
  }
</script>

<div class="min-h-screen bg-surface">
  <div class="max-w-4xl mx-auto p-4 md:p-8">
    <header class="mb-6 flex items-center justify-between">
      <a href="/" class="text-gray-500 hover:text-primary"
        >← {settings.t.common.back}</a
      >
      <h1 class="text-2xl font-bold text-primary">
        {settings.t.notifications.title}
      </h1>
      <div class="w-8"></div>
    </header>

    {#if loading}
      <div class="flex justify-center py-12">
        <div
          class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
        ></div>
      </div>
    {:else if offers.length === 0}
      <div
        class="text-center py-20 bg-white/50 rounded-2xl border-2 border-dashed border-white"
      >
        <p class="text-gray-500 font-medium">{settings.t.notifications.empty}</p>
      </div>
    {:else}
      <div class="space-y-4">
        {#each offers as offer (offer.uri)}
          <div
            class="sticker-card-interactive flex items-center justify-between"
            transition:slide
          >
            <div class="flex items-center gap-3">
              <a
                href="/profile/{offer.partnerDid}"
                class="block transition-opacity hover:opacity-80"
              >
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
              </a>
              <div>
                <h3 class="font-bold text-gray-800">
                  {offer.profile?.displayName ||
                    offer.profile?.handle ||
                    offer.partnerDid}
                </h3>
                <p class="text-sm text-gray-600">
                  {settings.t.notifications.wantsToSend.replace(
                    "{n}",
                    (offer.offer.stickerOut?.length || 0).toString(),
                  )}
                </p>
              </div>
            </div>

            <div class="flex gap-2">
              <button
                onclick={() => handleReject(offer)}
                disabled={processing === offer.partnerDid}
                class="bg-gray-100 text-red-500 px-6 py-2 rounded-full text-sm font-bold shadow-sm hover:shadow-md transition-shadow hover:bg-gray-200"
              >
                {processing === offer.partnerDid
                  ? settings.t.exchange.rejecting
                  : settings.t.exchange.reject}
              </button>
              <button
                onclick={() => handleAccept(offer)}
                disabled={processing === offer.partnerDid}
                class="bg-secondary text-white px-6 py-2 rounded-full text-sm font-bold shadow-sm hover:shadow-md transition-shadow"
              >
                {settings.t.notifications.accept}
              </button>
            </div>
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
