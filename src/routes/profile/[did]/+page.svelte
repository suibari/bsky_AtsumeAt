<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { getClient } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import { goto } from "$app/navigation";
  import StickerBook from "$lib/components/StickerBook.svelte";
  import { publicAgent } from "$lib/game";

  let agent = $state<Agent | null>(null);
  let profile = $state<any>(null);
  let loadingProfile = $state(true);

  const did = $derived($page.params.did);

  onMount(async () => {
    const c = getClient();
    if (c) {
      const res = await c.init();
      if (res && res.session) {
        agent = new Agent(res.session);
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
    class="bg-white/80 backdrop-blur-md shadow-sm border-b border-primary/20 z-20 sticky top-0"
  >
    <div class="max-w-6xl mx-auto p-4 flex items-center gap-4">
      <a href="/" class="text-gray-500 hover:text-primary">← Home</a>
      <h1 class="text-xl font-bold text-gray-800">Profile</h1>
    </div>
  </header>

  <main class="max-w-6xl mx-auto p-4 md:p-8">
    {#if loadingProfile}
      <div class="text-center py-12">
        <div
          class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"
        ></div>
        <p class="text-gray-500">Loading Profile...</p>
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

          {#if profile.description}
            <p
              class="mt-4 text-gray-700 whitespace-pre-wrap text-sm leading-relaxed max-w-2xl bg-gray-50 p-4 rounded-xl border border-gray-100"
            >
              {profile.description}
            </p>
          {/if}

          <!-- Stats -->
          <div
            class="mt-4 flex items-center justify-center md:justify-start gap-6 text-sm text-gray-500"
          >
            <div>
              <span class="font-bold text-gray-900"
                >{profile.followersCount}</span
              > Followers
            </div>
            <div>
              <span class="font-bold text-gray-900">{profile.followsCount}</span
              > Following
            </div>
          </div>
        </div>
      </div>

      <!-- Sticker Book -->
      {#if agent}
        <StickerBook
          {agent}
          targetDid={did}
          title={`${profile.displayName || profile.handle}'s Stickers`}
        />
      {/if}
    {:else}
      <div class="text-center py-12 text-gray-500">Profile not found.</div>
    {/if}
  </main>
</div>
