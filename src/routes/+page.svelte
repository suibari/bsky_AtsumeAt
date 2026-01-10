<script lang="ts">
  import { onMount } from "svelte";
  import { getClient } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import Landing from "$lib/components/Landing.svelte";
  import StickerBook from "$lib/components/StickerBook.svelte";
  import { initStickers } from "$lib/game";

  let agent = $state<Agent | null>(null);
  let loading = $state(true);
  let view = $state<"landing" | "book">("landing");

  onMount(async () => {
    try {
      const c = getClient();
      if (c) {
        // Initialize checks for existing session
        const res = await c.init();
        if (res) {
          agent = new Agent(res.session);
          view = "book";
          // Check if new user -> Init stickers
          if (agent.assertDid) {
            const returnUrl = localStorage.getItem("returnUrl");

            // Initialization logic - ALWAYS run before redirect
            // We await this to ensure the "My Sticker" indicator is set.
            // If this fails, we might still want to redirect, so we catch error.
            try {
              await initStickers(agent, agent.assertDid);
            } catch (e) {
              console.error("Init failed", e);
            }

            if (returnUrl) {
              localStorage.removeItem("returnUrl");
              window.location.href = returnUrl;
              return;
            }
          }
        }
      }
    } catch (e) {
      console.error("Auth init failed", e);
    } finally {
      loading = false;
    }
  });

  function handleLogout() {
    localStorage.removeItem("atproto-oauth-session");
    window.location.reload();
  }
</script>

{#if loading}
  <div class="flex items-center justify-center h-screen bg-background">
    <div
      class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"
    ></div>
  </div>
{:else if agent && view === "book"}
  <div class="min-h-screen bg-surface">
    <header class="bg-white shadow p-4 flex justify-between items-center">
      <h1 class="text-xl font-bold text-primary">BonBonDropAt</h1>
      <button
        onclick={handleLogout}
        class="text-sm text-gray-500 hover:text-red-500">Sign Out</button
      >
    </header>
    <main class="p-4">
      <StickerBook {agent} />

      <div class="mt-8">
        <h3 class="text-lg font-bold mb-2">Exchange</h3>
        <p class="text-sm text-gray-600">
          Search for users and start an exchange.
        </p>
        <!-- Search Component Placeholder -->
      </div>
    </main>
  </div>
{:else}
  <Landing />
{/if}
