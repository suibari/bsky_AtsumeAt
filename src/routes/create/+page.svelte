<script lang="ts">
  import { onMount } from "svelte";
  import { getClient } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import { goto } from "$app/navigation";
  import { STICKER_COLLECTION, type Sticker } from "$lib/schemas";

  let agent = $state<Agent | null>(null);
  let fileInput = $state<HTMLInputElement>();
  let imageUrl = $state<string | null>(null);
  let name = $state("");
  let processing = $state(false);

  // Crop State
  let cropContainer = $state<HTMLDivElement>();
  let imageElement = $state<HTMLImageElement>();
  let scale = $state(1);
  let position = $state({ x: 0, y: 0 });
  let isDragging = $state(false);
  let dragStart = $state({ x: 0, y: 0 });

  // Pinch State
  let pinchStartDist = $state(0);
  let pinchStartScale = $state(1);
  let isPinching = $state(false);

  onMount(async () => {
    const c = getClient();
    if (c) {
      const res = await c.init();
      if (res && res.session) {
        agent = new Agent(res.session);
      } else {
        goto("/");
      }
    }
  });

  function handleFileSelect(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      imageUrl = URL.createObjectURL(file);
      // Reset crop
      scale = 1;
      position = { x: 0, y: 0 };
    }
  }

  function onMouseDown(e: MouseEvent | TouchEvent) {
    // Only handle mouse or single touch (if passed from generic handler, though we will separate them)
    // We'll keep this strictly for dragging logic
    isDragging = true;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStart = { x: clientX - position.x, y: clientY - position.y };
  }

  function onMouseMove(e: MouseEvent | TouchEvent) {
    if (!isDragging) return;
    e.preventDefault();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    position.x = clientX - dragStart.x;
    position.y = clientY - dragStart.y;
  }

  function onMouseUp() {
    isDragging = false;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    // Adjust zoom sensitivity
    const zoomIntensity = 0.001;
    const delta = -e.deltaY * zoomIntensity;
    const newScale = Math.min(Math.max(scale + delta, 0.1), 3);
    scale = newScale;
  }

  function getDistance(t1: Touch, t2: Touch) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      isPinching = true;
      isDragging = false;
      pinchStartDist = getDistance(e.touches[0], e.touches[1]);
      pinchStartScale = scale;
      e.preventDefault();
    } else if (e.touches.length === 1) {
      onMouseDown(e);
    }
  }

  function onTouchMove(e: TouchEvent) {
    if (isPinching && e.touches.length === 2) {
      e.preventDefault();
      const currentDist = getDistance(e.touches[0], e.touches[1]);
      if (pinchStartDist > 0) {
        const ratio = currentDist / pinchStartDist;
        scale = Math.min(Math.max(pinchStartScale * ratio, 0.1), 3);
      }
    } else if (!isPinching) {
      onMouseMove(e);
    }
  }

  function onTouchEnd(e: TouchEvent) {
    if (isPinching) {
      if (e.touches.length < 2) {
        isPinching = false;
      }
    }
    onMouseUp();
  }

  async function handleCreate() {
    if (!agent || !imageUrl || !imageElement) return;
    processing = true;

    try {
      // 1. Draw to Canvas (Crop)
      const canvas = document.createElement("canvas");
      const size = 500; // Target size
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;

      // Calculate source rect based on visual crop
      // Visual: Container 300x300. Image scaled & translated.
      // Map visual coords to original image coords.

      // Actually, easier to draw image transformed on canvas
      // We need to replicate the CSS transform.
      // But screen pixels != image pixels.

      // Let's use the simple approach: Draw image with same transform logic
      // Container is creating a viewport.
      // We want to draw WHAT IS VISIBLE in the 300x300 box into the 500x500 canvas.

      // Image natural dims
      const natW = imageElement.naturalWidth;
      const natH = imageElement.naturalHeight;

      // Rendered dims
      // We apply scale to the image.
      // The offset (position) is in pixels relative to the container center or top-left?
      // CSS: translate(x, y) scale(s)

      // Let's adjust logic:
      // Center of image at Center of Canvas + Translate

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, size, size);

      // Scale factor between Preview (300px) and Output (500px)
      const outputScale = size / 300;

      ctx.save();
      // Move to center
      ctx.translate(size / 2, size / 2);
      ctx.translate(position.x * outputScale, position.y * outputScale);
      ctx.scale(scale * outputScale, scale * outputScale);
      // Draw image centered
      ctx.drawImage(imageElement, -natW / 2, -natH / 2);
      ctx.restore();

      // 2. To Blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("Canvas blob failed");

      // 3. Upload to Bluesky
      // Need to sign headers? Agent does it.
      // uploadBlob expects Uint8Array usually or Blob?
      // agent.uploadBlob(data, { encoding: 'image/jpeg' })

      const arrayBuffer = await blob.arrayBuffer();
      const uploadRes = await agent.uploadBlob(new Uint8Array(arrayBuffer), {
        encoding: "image/jpeg",
      });

      const cid = uploadRes.data.blob.ref.toString();

      // Construct the canonical CDN URL for the sticker
      const stickerImageUrl = `https://cdn.bsky.app/img/feed_fullsize/plain/${agent.assertDid!}/${cid}@jpeg`;

      // 3.5 Sign the Payload
      // We need to fetch the signature helper logic or call the API directly here.
      // Since requestSignature is not exported or we are in a component, let's call fetch directly.
      const payloadInfo = {
        model: `cid:${cid}`,
        name: name || undefined,
        image: stickerImageUrl, // Use the string URL to match acceptExchange consistency
      };

      let signature: string | undefined;
      let signedPayload: string | undefined;

      try {
        const signRes = await fetch("/api/sign-seal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userDid: agent.assertDid!,
            payload: { info: payloadInfo },
          }), // matching structure in game.ts
        });
        if (signRes.ok) {
          const data = await signRes.json();
          signature = data.signature;
          signedPayload = data.signedPayload;
        } else {
          console.error("Signing failed");
        }
      } catch (e) {
        console.error("Signing error", e);
      }

      // 4. Create Sticker Record
      const record: Sticker = {
        $type: STICKER_COLLECTION,
        image: uploadRes.data.blob,
        imageType: "custom",
        subjectDid: agent.assertDid!,
        originalOwner: agent.assertDid!,
        model: `cid:${cid}`,
        name: name || undefined,
        obtainedAt: new Date().toISOString(),
        signature,
        signedPayload,
      };

      await agent.com.atproto.repo.createRecord({
        repo: agent.assertDid!,
        collection: STICKER_COLLECTION,
        record,
      });

      goto("/");
    } catch (e) {
      console.error("Creation failed", e);
      alert("Failed to create sticker");
    } finally {
      processing = false;
    }
  }
</script>

<div class="min-h-screen bg-surface">
  <div class="max-w-6xl mx-auto p-4 md:p-8 flex flex-col items-center">
    <header class="w-full max-w-3xl flex items-center justify-between mb-8">
      <a href="/" class="text-gray-500 hover:text-primary">← Back</a>
      <h1 class="text-xl font-bold text-primary">Create Sticker</h1>
      <div class="w-8"></div>
    </header>

    <div
      class="w-full max-w-3xl bg-white rounded-xl shadow p-6 flex flex-col items-center"
    >
      {#if !imageUrl}
        <div
          class="w-full h-64 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
          onclick={() => fileInput?.click()}
        >
          <span class="text-4xl mb-2">📷</span>
          <span class="text-gray-500">Select Image</span>
          <input
            bind:this={fileInput}
            type="file"
            accept="image/*"
            class="hidden"
            onchange={handleFileSelect}
          />
        </div>
      {:else}
        <!-- Crop Area -->
        <div
          class="relative w-[300px] h-[300px] bg-white overflow-hidden rounded-full shadow-inner border-4 border-primary cursor-move touch-none"
          bind:this={cropContainer}
          onmousedown={onMouseDown}
          onmousemove={onMouseMove}
          onmouseup={onMouseUp}
          onmouseleave={onMouseUp}
          onwheel={onWheel}
          ontouchstart={onTouchStart}
          ontouchmove={onTouchMove}
          ontouchend={onTouchEnd}
          ontouchcancel={onTouchEnd}
          role="application"
        >
          <img
            bind:this={imageElement}
            src={imageUrl}
            alt="Work"
            class="absolute max-w-none origin-center pointer-events-none"
            style="transform: translate(-50%, -50%) translate({position.x}px, {position.y}px) scale({scale}); left: 50%; top: 50%;"
          />
        </div>

        <!-- Controls -->
        <div class="w-full mt-6 space-y-4">
          <div>
            <label class="text-sm font-medium text-gray-700">Zoom</label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              bind:value={scale}
              class="w-full"
            />
          </div>

          <!-- Name Input -->
          <div class="mt-4 w-full">
            <label class="text-sm font-medium text-gray-700 mb-1 block"
              >Name (Optional)</label
            >
            <input
              type="text"
              bind:value={name}
              placeholder="e.g. My Awesome Sticker"
              class="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none h-10"
              maxlength="50"
            />
          </div>

          <div class="flex gap-2 w-full">
            <button
              class="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              onclick={() => {
                imageUrl = null;
                name = "";
              }}
            >
              Cancel
            </button>
            <button
              class="flex-1 py-2 px-4 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              onclick={handleCreate}
              disabled={processing}
            >
              {processing ? "Creating..." : "Create Sticker"}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
