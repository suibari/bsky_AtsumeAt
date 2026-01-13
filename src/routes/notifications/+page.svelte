<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getClient } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import { checkIncomingOffers, type IncomingOffer } from "$lib/exchange";
  import { i18n } from "$lib/i18n.svelte";
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
  <div class="max-w-4xl mx-auto p-4 md:p-8">
    <header class="mb-6 flex items-center justify-between">
      <a href="/" class="text-gray-500 hover:text-primary"
        >← {i18n.t.common.back}</a
      >
      <h1 class="text-2xl font-bold text-primary">
        {i18n.t.notifications.title}
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
        <p class="text-gray-500 font-medium">{i18n.t.notifications.empty}</p>
      </div>
    {:else}
      <div class="space-y-4">
        {#each offers as offer (offer.uri)}
          <div
            class="sticker-card-interactive flex items-center justify-between"
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
                <p class="text-sm text-gray-600">
                  {i18n.t.notifications.wantsToSend.replace(
                    "{n}",
                    (offer.offer.stickerOut?.length || 0).toString(),
                  )}
                </p>
              </div>
            </div>

            <button
              onclick={() => handleAccept(offer)}
              class="bg-secondary text-white px-6 py-2 rounded-full text-sm font-bold shadow-sm hover:shadow-md transition-shadow"
            >
              {i18n.t.notifications.accept}
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
