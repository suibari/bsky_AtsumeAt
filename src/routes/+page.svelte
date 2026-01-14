<script lang="ts">
  import { onMount } from "svelte";
  import { initStickers } from "$lib/stickers";
  import { getClient, signOut, publicAgent } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import Landing from "$lib/components/Landing.svelte";
  import StickerBook from "$lib/components/StickerBook.svelte";
  import { resolvePendingExchanges, checkIncomingOffers } from "$lib/exchange";
  import AboutModal from "$lib/components/AboutModal.svelte";
  import InfoModal from "$lib/components/InfoModal.svelte";
  import { i18n } from "$lib/i18n.svelte";

  import { fade, fly } from "svelte/transition";

  let agent = $state<Agent | null>(null);
  let loading = $state(true);
  let loadingMessage = $state(i18n.t.common.loading);
  let view = $state<"landing" | "book">("landing");
  let menuOpen = $state(false);
  let notificationCount = $state(0);
  let showAbout = $state(false);
  let showInfo = $state(false);

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
            await resolvePendingExchanges(agent, (msg) => {
              loadingMessage = msg;
            });

            // Check for Incoming Offers (Notifications)
            // Non-blocking for UI responsiveness
            checkIncomingOffers(agent).then((offers) => {
              const lastChecked = localStorage.getItem(
                "lastCheckedNotificationAt",
              );
              if (lastChecked) {
                const threshold = new Date(lastChecked).getTime();
                notificationCount = offers.filter(
                  (o) => new Date(o.offer.createdAt).getTime() > threshold,
                ).length;
              } else {
                notificationCount = offers.length;
              }
            });

            const returnUrl = localStorage.getItem("returnUrl");

            // Initialization logic - ALWAYS run before redirect
            try {
              loadingMessage =
                i18n.lang === "ja"
                  ? "シール帳を確認中..."
                  : "Checking your sticker book...";
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

  async function handleLogout() {
    if (agent?.assertDid) {
      await signOut(agent.assertDid);
    }
    window.location.reload();
  }
</script>

{#if loading}
  <div class="min-h-screen bg-surface flex items-center justify-center">
    <div class="text-center">
      <div
        class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"
      ></div>
      <p class="text-gray-500 font-medium">{loadingMessage}</p>
    </div>
  </div>
{:else if agent && view === "book"}
  <div class="min-h-screen bg-surface">
    <header
      class="bg-white/80 backdrop-blur-md shadow-sm border-b border-primary/20 z-20 sticky top-0"
    >
      <div
        class="max-w-6xl mx-auto p-4 flex justify-between items-center relative"
      >
        <div class="flex items-center gap-2">
          <h1 class="text-xl font-bold text-primary">{i18n.t.appName}</h1>
          <span class="text-sm text-gray-400 border-l pl-2 ml-1"
            >{i18n.t.header.stickerBook}</span
          >
        </div>

        <div class="flex items-center gap-4">
          <!-- Notification Bell -->
          <a
            href="/notifications"
            class="relative p-2 text-gray-600 hover:text-primary transition-colors"
          >
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
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {#if notificationCount > 0}
              <span
                class="absolute top-1 right-1 flex h-4 w-4 bg-red-500 rounded-full items-center justify-center text-[10px] text-white font-bold ring-2 ring-white"
              >
                {notificationCount}
              </span>
            {/if}
          </a>

          <!-- Info Button -->
          <button
            onclick={() => (showInfo = true)}
            class="p-2 text-gray-600 hover:text-primary transition-colors"
            aria-label={i18n.t.header.info}
          >
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
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>

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
        </div>

        <!-- Menu Dropdown -->
        {#if menuOpen}
          <div
            class="absolute top-16 right-4 w-48 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border-2 border-primary/10 py-2 flex flex-col z-30"
            transition:fly={{ y: -10, duration: 200 }}
          >
            <a
              href="/create"
              class="px-4 py-2 hover:bg-secondary/20 text-gray-700 font-medium text-sm flex items-center gap-2"
            >
              <span>🎨</span>
              {i18n.t.header.create}
            </a>
            <a
              href="/exchange"
              class="px-4 py-2 hover:bg-secondary/20 text-gray-700 font-medium text-sm flex items-center gap-2"
            >
              <span>🤝</span>
              {i18n.t.header.exchange}
            </a>
            <a
              href="/share"
              class="px-4 py-2 hover:bg-secondary/20 text-gray-700 font-medium text-sm flex items-center gap-2"
            >
              <span>✨</span>
              {i18n.t.header.share}
            </a>
            <button
              onclick={() => {
                menuOpen = false;
                showAbout = true;
              }}
              class="px-4 py-2 w-full text-left hover:bg-secondary/20 text-gray-700 font-medium text-sm flex items-center gap-2"
            >
              <span>ℹ️</span>
              {i18n.t.header.about}
            </button>
            <div class="h-px bg-gray-100 my-1"></div>
            <a
              href="/settings"
              class="px-4 py-2 hover:bg-secondary/20 text-gray-700 font-medium text-sm flex items-center gap-2"
            >
              <span>⚙️</span>
              {i18n.t.header.settings}
            </a>
            <div class="h-px bg-gray-100 my-1"></div>
            <button
              onclick={handleLogout}
              class="px-4 py-2 w-full text-left hover:bg-red-50 text-red-600 font-medium text-sm flex items-center gap-2"
            >
              <span>🚪</span>
              {i18n.t.header.signOut}
            </button>
          </div>

          <!-- Click outside handler overlay -->
          <div
            class="fixed inset-0 z-10"
            onclick={() => (menuOpen = false)}
          ></div>
        {/if}
      </div>
    </header>
    <main class="max-w-6xl mx-auto p-4 md:p-8">
      <StickerBook {agent} />
    </main>

    {#if showAbout}
      <AboutModal onClose={() => (showAbout = false)} />
    {/if}

    {#if showInfo}
      <InfoModal onClose={() => (showInfo = false)} />
    {/if}
  </div>
{:else}
  <Landing />
{/if}
