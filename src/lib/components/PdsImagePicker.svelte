<script lang="ts">
  import { onMount } from "svelte";
  import { Agent } from "@atproto/api";
  import { settings } from "$lib/settings.svelte";
  import { getAllStickerRecords } from "$lib/stickers";
  import { getPdsEndpoint } from "$lib/atproto";

  let { agent, onSelect } = $props<{
    agent: Agent;
    onSelect: (url: string) => void;
  }>();

  let images = $state<{ url: string; cid: string; thumb: string }[]>([]);
  let cursor = $state<string | undefined>(undefined);
  let loading = $state(false);
  let stickerCids = $state(new Set<string>());
  let pdsAgent = $state<Agent | null>(null);

  onMount(async () => {
    if (!agent.assertDid) return;
    loading = true;

    // 1. Fetch existing stickers (to exclude)
    try {
      const stickers = await getAllStickerRecords(agent, agent.assertDid);
      stickers.forEach((s) => {
        if (s.image && typeof s.image === "object" && "ref" in s.image) {
          const ref = s.image.ref as any;
          const cid = ref.$link || ref.toString();
          stickerCids.add(cid);
        }
      });
    } catch (e) {
      console.warn("Failed to fetch stickers for exclusion", e);
    }

    // 2. Setup PDS Agent and Load
    try {
      const endpoint = await getPdsEndpoint(agent.assertDid);
      if (endpoint) {
        pdsAgent = new Agent(endpoint);
        await loadMore();
      } else {
        console.error("Could not resolve PDS endpoint");
      }
    } catch (e) {
      console.error("Failed to setup PDS agent", e);
    } finally {
      if (!pdsAgent) loading = false;
    }
  });

  async function loadMore() {
    if (!agent.assertDid || !pdsAgent) return;
    loading = true;

    try {
      let attempts = 0;
      const MAX_ATTEMPTS = 10; // Try up to 10 pages (~250 posts) automatically
      let addedCount = 0;

      while (attempts < MAX_ATTEMPTS && addedCount === 0) {
        attempts++;

        // Use listRecords on PDS directly
        const res = await pdsAgent.com.atproto.repo.listRecords({
          repo: agent.assertDid,
          collection: "app.bsky.feed.post",
          limit: 25,
          cursor,
        });

        cursor = res.data.cursor;
        const newImages: { url: string; cid: string; thumb: string }[] = [];

        for (const r of res.data.records) {
          const record = r.value as any;
          if (!record.embed) continue;

          let blobs: any[] = [];

          // Extract blobs from embed
          if (record.embed.$type === "app.bsky.embed.images") {
            blobs = record.embed.images.map((i: any) => i.image);
          } else if (record.embed.$type === "app.bsky.embed.recordWithMedia") {
            if (record.embed.media?.$type === "app.bsky.embed.images") {
              blobs = record.embed.media.images.map((i: any) => i.image);
            }
          }

          // Process extract blobs
          for (const blob of blobs) {
            if (!blob || !blob.ref) continue;
            const cid = blob.ref.$link || blob.ref.toString();

            if (!stickerCids.has(cid)) {
              // Construct CDN URL
              const thumbUrl = `https://cdn.bsky.app/img/feed_thumbnail/plain/${agent.assertDid}/${cid}@jpeg`;
              const rawFullUrl = `https://cdn.bsky.app/img/feed_fullsize/plain/${agent.assertDid}/${cid}@jpeg`;
              // Use proxy for full URL to allow Canvas processing (CORS)
              const fullUrl = `/api/proxy?url=${encodeURIComponent(rawFullUrl)}`;

              newImages.push({
                cid,
                url: fullUrl,
                thumb: thumbUrl,
              });
            }
          }
        }

        if (newImages.length > 0) {
          images = [...images, ...newImages];
          addedCount += newImages.length;
        }

        if (!cursor) break; // End of repo
      }
    } catch (e) {
      console.error("Failed to load posts", e);
    } finally {
      loading = false;
    }
  }
</script>

<div class="w-full">
  {#if images.length === 0 && !loading}
    <div class="text-center py-8 text-gray-500 dark:text-gray-400">
      {settings.t.create.picker.noImages}
    </div>
  {:else}
    <div class="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
      {#each images as img}
        <button
          class="aspect-square relative overflow-hidden rounded-lg hover:opacity-80 transition-opacity focus:ring-2 focus:ring-primary focus:outline-none"
          onclick={() => onSelect(img.url)}
        >
          <img
            src={img.thumb}
            alt="From post"
            class="w-full h-full object-cover"
            loading="lazy"
          />
        </button>
      {/each}
    </div>
  {/if}

  {#if loading}
    <div class="flex justify-center p-4">
      <div
        class="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"
      ></div>
    </div>
  {/if}

  {#if cursor && !loading}
    <button
      class="w-full py-2 text-primary font-medium hover:bg-primary/5 dark:hover:bg-primary/10 rounded-lg transition-colors"
      onclick={loadMore}
    >
      {settings.t.create.picker.loadMore}
    </button>
  {/if}
</div>
