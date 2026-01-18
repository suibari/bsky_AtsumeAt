<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { getClient, publicAgent } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import { goto } from "$app/navigation";
  import StickerBook from "$lib/components/StickerBook.svelte";
  import { getUserStickers, type StickerWithProfile } from "$lib/stickers";
  import { createExchangePost } from "$lib/exchange";
  import type { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
  import { settings } from "$lib/settings.svelte";
  import {
    calculateAchievements,
    getUserStats,
    type Achievement,
  } from "$lib/achievements";
  import AchievementBanner from "$lib/components/AchievementBanner.svelte";

  let agent = $state<Agent | null>(null);
  let currentDid = $state<string | null>(null);
  let profile = $state<ProfileViewDetailed | null>(null);
  let loadingProfile = $state(true);
  let achievements = $state<Achievement[]>([]);

  const did = $derived($page.params.did);

  onMount(async () => {
    const c = getClient();
    if (c) {
      const res = await c.init();
      if (res && res.session) {
        agent = new Agent(res.session);
        currentDid = res.session.did;
        await loadProfile();
      } else {
        goto("/");
      }
    }
  });

  async function loadProfile() {
    if (!agent || !did) return;
    loadingProfile = true;
    try {
      const res = await publicAgent.getProfile({ actor: did });
      profile = res.data;

      // Load Achievements (Async, don't block main UI excessively if unnecessary, but here we want to show it)
      // Use publicAgent or agent. Logic needs 'listRecords'. publicAgent is fine for reading.
      // But getUserStats uses 'agent' argument. stickers.ts mostly uses whatever agent passed.
      // 'getAllStickerRecords' uses the agent passed.
      // Let's use the authenticated agent if available, or publicAgent if we were browsing as guest (but here we require login per onMount logic essentially? No, publicAgent is imported)
      // Wait, onMount checks for session. Basic access might be restricted to logged in users in this app?
      // Yes, onMount redirects to / if no session. So 'agent' is available.
      // But we should pass 'agent' to be safe.
      const stats = await getUserStats(agent, did);
      achievements = calculateAchievements(stats);
    } catch (e) {
      console.error("Failed to fetch profile", e);
    } finally {
      loadingProfile = false;
    }
  }

  // Reload when did changes (if navigating between profiles)
  $effect(() => {
    if (agent && did && profile?.did !== did) {
      loadProfile();
    }
  });
</script>

<div class="min-h-screen bg-surface">
  <header
    class="bg-white/80 backdrop-blur-md shadow-sm border-b border-primary/20 z-50 sticky top-0"
  >
    <div class="max-w-6xl mx-auto p-4 flex items-center gap-4">
      <a href="/" class="text-gray-500 hover:text-primary">← Home</a>
      <h1 class="text-xl font-bold text-gray-800">Profile</h1>
    </div>
  </header>

  <main class="max-w-6xl mx-auto p-4 md:p-8">
    {#if loadingProfile}
      <div class="flex justify-center p-20">
        <div
          class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
        ></div>
        <p class="ml-3 text-gray-500">{settings.t.profile.loading}</p>
      </div>
    {:else if profile}
      <div
        class="card-glass p-6 mb-8 flex flex-col md:flex-row items-center md:items-start gap-6"
      >
        <!-- Avatar -->
        <a
          href={`https://bsky.app/profile/${profile.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          class="relative group"
        >
          <img
            src={profile.avatar}
            alt={profile.displayName}
            class="w-24 h-24 rounded-full border-4 border-white shadow-md object-cover transition transform group-hover:scale-105"
          />
          <div
            class="absolute inset-0 rounded-full bg-black/10 opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
          >
            <span class="text-white text-xs font-bold">Bluesky ↗</span>
          </div>
        </a>

        <!-- Info -->
        <div class="text-center md:text-left flex-1">
          <h2 class="text-2xl font-bold text-gray-900">
            {profile.displayName || profile.handle}
          </h2>

          <p class="text-gray-500 font-medium">@{profile.handle}</p>

          <AchievementBanner {achievements} />

          {#if profile.description}
            <p
              class="mt-4 text-gray-700 whitespace-pre-wrap text-sm leading-relaxed max-w-2xl bg-gray-50 p-4 rounded-xl border border-gray-100"
            >
              {profile.description}
            </p>
          {/if}

          <!-- Stats -->
          <div class="flex gap-6 mt-4">
            <div class="text-center">
              <div class="font-bold text-lg">{profile.followersCount || 0}</div>
              <div class="text-xs text-gray-500 uppercase tracking-wider">
                {settings.t.profile.followers}
              </div>
            </div>
            <div class="text-center">
              <div class="font-bold text-lg">{profile.followsCount || 0}</div>
              <div class="text-xs text-gray-500 uppercase tracking-wider">
                {settings.t.profile.following}
              </div>
            </div>
          </div>

          <!-- Exchange Button -->
          {#if currentDid && currentDid !== profile.did}
            <div class="mt-6">
              <a
                href={`/exchange?partner=${profile.handle}`}
                class="btn-secondary inline-flex items-center gap-2"
              >
                <span>🍬</span>
                {settings.t.profile.exchange}
              </a>
            </div>
          {/if}
        </div>
      </div>

      <!-- Sticker Book -->
      <div class="mt-8">
        <h2 class="text-xl font-bold mb-6 text-primary flex items-center gap-2">
          <span class="text-2xl">✨</span>
          {settings.t.profile.userStickers.replace(
            "{name}",
            profile.displayName || profile.handle,
          )}
        </h2>
        {#if agent}
          <StickerBook {agent} targetDid={profile.did} />
        {/if}
      </div>
    {:else}
      <div class="text-center py-20">
        <p class="text-gray-500 mb-6">{settings.t.profile.notFound}</p>
        <a href="/" class="btn-primary">{settings.t.profile.backHome}</a>
      </div>
    {/if}
  </main>
</div>
