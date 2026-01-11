<script lang="ts">
  import { onMount } from "svelte";
  import { getClient } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import Landing from "$lib/components/Landing.svelte";
  import StickerBook from "$lib/components/StickerBook.svelte";
  import AnnouncementBar from "$lib/components/AnnouncementBar.svelte";
  import { initStickers } from "$lib/game";

  let agent = $state<Agent | null>(null);
  let loading = $state(true);
  let view = $state<"landing" | "book">("landing");
  let announcement = $state({ visible: false, mainText: "", subText: "" });

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
              // Check if we need to show "First Time" sequence
              // But initStickers returns fast if already done.
              // To avoid flashing, we can show it optimistically or just check result.
              // Logic: Call it. If true, it took some time and created stickers. Show "Success" or "Start".
              // If we want "Start" BEFORE, we don't know if it's new user yet without check.
              // Modified strategy:
              // 1. Check if configured (quick check). If not, SHOW BAR.
              // 2. Run init.

              // However, initStickers does the check inside.
              // Let's rely on the return value.
              // If it takes > 100ms, it's probably running.
              // But user wants "Start" visual.

              // We can just set loading state visually with the bar?
              // "READY TO COLLECT"

              const isNewUser = await initStickers(agent, agent.assertDid);
              if (isNewUser) {
                // Trigger Sequence
                announcement = {
                  visible: true,
                  mainText: "INITIALIZING...",
                  subText: "Setting up your sticker book",
                };
                await new Promise((r) => setTimeout(r, 2000)); // Show for effect
                announcement = {
                  visible: true,
                  mainText: "STICKERS GET!",
                  subText: "6 New Stickers Added",
                };
                await new Promise((r) => setTimeout(r, 1500));
                announcement.visible = false;
              }
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

<AnnouncementBar
  visible={announcement.visible}
  mainText={announcement.mainText}
  subText={announcement.subText}
/>
