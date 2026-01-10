<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { getClient } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import { acceptExchange } from "$lib/game";
  import Landing from "$lib/components/Landing.svelte";

  let agent = $state<Agent | null>(null);
  let targetUser = $derived($page.url.searchParams.get("user"));
  let loading = $state(true);
  let processing = $state(false);
  let success = $state(false);

  onMount(async () => {
    const c = getClient();
    if (c) {
      const res = await c.init();
      if (res) {
        agent = new Agent(res.session);
      }
    }
    loading = false;
  });

  async function handleAccept() {
    if (!agent || !targetUser) return;
    processing = true;
    try {
      await acceptExchange(agent, targetUser);
      success = true;
    } catch (e) {
      console.error("Exchange failed", e);
      alert("Failed to accept exchange. See console.");
    } finally {
      processing = false;
    }
  }
</script>

<div
  class="min-h-screen bg-surface flex flex-col items-center justify-center p-4"
>
  {#if loading}
    <div
      class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"
    ></div>
  {:else if !agent}
    <div class="bg-white p-8 rounded-2xl shadow-xl max-w-md text-center">
      <h2 class="text-2xl font-bold mb-4">Sign In Required</h2>
      <p class="mb-6 text-gray-600">
        You need to sign in to exchange stickers!
      </p>
      <Landing />
    </div>
  {:else if !targetUser}
    <div class="bg-white p-8 rounded-2xl shadow-xl">
      <h2 class="text-xl text-red-500 font-bold">Invalid Link</h2>
      <p>No user specified for exchange.</p>
      <a href="/" class="text-primary hover:underline mt-4 block">Go Home</a>
    </div>
  {:else if success}
    <div class="bg-white p-8 rounded-2xl shadow-xl text-center">
      <h2 class="text-3xl font-bold text-green-500 mb-4">Exchange Accepted!</h2>
      <p class="text-gray-600 mb-8">
        You have received a new sticker and sent one back!
      </p>
      <a
        href="/"
        class="bg-primary text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-600 transition"
      >
        View My Sticker Book
      </a>
    </div>
  {:else}
    <div class="bg-white p-8 rounded-2xl shadow-xl max-w-md text-center">
      <h2 class="text-2xl font-bold mb-2">Sticker Offer!</h2>
      <p class="text-gray-600 mb-6">
        User <span class="font-mono bg-gray-100 px-1 rounded">{targetUser}</span
        > wants to swap stickers with you.
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
</div>
