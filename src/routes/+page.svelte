<script lang="ts">
  import { onMount } from "svelte";
  import { getClient, signOut } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import Landing from "$lib/components/Landing.svelte";
  import StickerBook from "$lib/components/StickerBook.svelte";
  import AnnouncementBar from "$lib/components/AnnouncementBar.svelte";
  import { initStickers, resolvePendingExchanges } from "$lib/game";

  import { fade, fly } from "svelte/transition";

  let agent = $state<Agent | null>(null);
  let loading = $state(true);
  let view = $state<"landing" | "book">("landing");
  let announcement = $state({ visible: false, mainText: "", subText: "" });
  let menuOpen = $state(false);

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
            // Check for Pending Exchanges (Finalize)
            // Fire and forget, or await? Better to await so UI might update with new stickers?
            // But initStickers also creates stickers.
            await resolvePendingExchanges(agent);

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
                  subText: "My Sticker Added",
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

  async function handleLogout() {
    if (agent?.assertDid) {
      await signOut(agent.assertDid);
    }
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
    <header
      class="bg-white shadow p-4 flex justify-between items-center relative z-20"
    >
      <div class="flex items-center gap-2">
        <h1 class="text-xl font-bold text-primary">あつめあっと</h1>
      </div>

      <!-- Menu Button -->
      <button
        onclick={() => (menuOpen = !menuOpen)}
        class="p-2 rounded-full hover:bg-gray-100 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6 text-gray-700"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 6h16M4 12h16m-7 6h7"
          />
        </svg>
      </button>

      <!-- Menu Dropdown -->
      {#if menuOpen}
        <div
          class="absolute top-16 right-4 w-48 bg-white rounded-lg shadow-xl border border-gray-100 py-2 flex flex-col z-30"
          transition:fly={{ y: -10, duration: 200 }}
        >
          <a
            href="/create"
            class="px-4 py-2 hover:bg-blue-50 text-gray-700 font-medium text-sm flex items-center gap-2"
          >
            <span>🎨</span> Create Sticker
          </a>
          <a
            href="/exchange"
            class="px-4 py-2 hover:bg-blue-50 text-gray-700 font-medium text-sm flex items-center gap-2"
          >
            <span>🤝</span> Exchange
          </a>
          <div class="h-px bg-gray-100 my-1"></div>
          <button
            onclick={handleLogout}
            class="px-4 py-2 w-full text-left hover:bg-red-50 text-red-600 font-medium text-sm flex items-center gap-2"
          >
            <span>🚪</span> Sign Out
          </button>
        </div>

        <!-- Click outside handler overlay -->
        <div
          class="fixed inset-0 z-10"
          onclick={() => (menuOpen = false)}
        ></div>
      {/if}
    </header>
    <main class="p-4">
      <StickerBook {agent} />
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
