<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getClient, publicAgent } from "$lib/atproto";
  import { Agent } from "@atproto/api";
  import { getUserStickers, type StickerWithProfile } from "$lib/stickers";
  import StickerThumb from "./StickerThumb.svelte";
  import html2canvas from "html2canvas";
  import { getDominantColor } from "$lib/color";

  let agent = $state<Agent | null>(null);
  let stickers = $state<StickerWithProfile[]>([]);
  let canvas: any; // Fabric Canvas
  let canvasEl: HTMLCanvasElement;
  let processing = $state(false);
  let isPenMode = $state(false);

  // Fabric modules loaded dynamically
  let fabricModule: any;

  onMount(async () => {
    // Auth Check
    const c = getClient();
    if (c) {
      const res = await c.init();
      if (res && res.session) {
        agent = new Agent(res.session);
        // Load stickers
        try {
          stickers = await getUserStickers(agent, agent.assertDid!);
        } catch (e) {
          console.error("Failed to load stickers", e);
        }
      }
    }

    // Load Fabric
    try {
      fabricModule = await import("fabric");
      initCanvas();
    } catch (e) {
      console.error("Failed to load fabric", e);
    }

    // Random Background Logic
    randomizeBackground();
  });

  onDestroy(() => {
    if (canvas) {
      canvas.dispose();
    }
  });

  function initCanvas() {
    if (!canvasEl || !fabricModule) return;

    // Create Fabric Canvas
    canvas = new fabricModule.Canvas(canvasEl, {
      width: 400,
      height: 600,
      backgroundColor: "transparent",
      isDrawingMode: false,
      preserveObjectStacking: true, // Keep stacking order
    });

    // Handle Drop
    const canvasContainer = canvasEl.parentElement;
    if (canvasContainer) {
      canvasContainer.addEventListener("drop", handleDrop);
      canvasContainer.addEventListener("dragover", (e) => e.preventDefault());
    }

    // Pen Brush Setup
    const brush = new fabricModule.PencilBrush(canvas);
    brush.color = "#ff69b4"; // Hot pink default (Yume-kawa)
    brush.width = 5;
    canvas.freeDrawingBrush = brush;
  }

  // Core Logic: Add Sticker to Canvas
  async function addStickerToCanvas(
    imgData: string | Blob,
    x?: number,
    y?: number,
  ) {
    if (!canvas || !fabricModule) return;

    let imgUrl = typeof imgData === "string" ? imgData : "";
    if (imgUrl.startsWith("http")) {
      imgUrl = `/api/proxy?url=${encodeURIComponent(imgUrl)}`;
    }

    try {
      const img: any = await fabricModule.FabricImage.fromURL(imgUrl, {
        crossOrigin: "anonymous",
      });
      if (!img) return;

      // Calculate Color (Async)
      let borderColor = "#FFD700";
      try {
        borderColor = await getDominantColor(imgUrl);
      } catch (e) {
        console.warn("Color calc failed", e);
      }

      // 1. Geometry Setup
      // Target visual size (Diameter)
      const targetSize = 150;
      const radius = targetSize / 2;
      const borderWidth = 4;
      const padding = 4;

      // Calculate Inner Image Radius
      const imageRadius = radius - borderWidth - padding;

      // Scale image to fit the inner radius
      const imgScale = (imageRadius * 2) / Math.max(img.width, img.height);

      // 2. Base Circle (The Colored Border)
      const baseCircle = new fabricModule.Circle({
        radius: radius,
        fill: borderColor,
        originX: "center",
        originY: "center",
      });

      // 3. White Circle (The Padding Background)
      const whiteCircle = new fabricModule.Circle({
        radius: radius - borderWidth,
        fill: "#ffffff",
        originX: "center",
        originY: "center",
      });

      // 4. The Image
      // Clip path for the image (Circular crop)
      const clipPath = new fabricModule.Circle({
        radius: img.width / 2, // Clip at original image size/center
        originX: "center",
        originY: "center",
      });
      // But wait, changing clipPath in a group setting can be tricky with scaling.
      // Easier: Clip the image instance relative to itself.
      // Since we scale the image instance, the clip path should match the unscaled dimensions?
      // Fabric clipPath is relative to the object center.
      // Let's use the min dimension circle.

      const clipRadius = Math.min(img.width, img.height) / 2;
      const imgClip = new fabricModule.Circle({
        radius: clipRadius,
        originX: "center",
        originY: "center",
      });

      img.set({
        scaleX: imgScale,
        scaleY: imgScale,
        clipPath: imgClip,
        originX: "center",
        originY: "center",
      });

      // Calculate Position
      let left = x;
      let top = y;

      if (left === undefined || top === undefined) {
        // canvas.getCenter() might not be available or reliable in all envs.
        // Use manual width/height fallback.
        left = (canvas.width || 400) / 2;
        top = (canvas.height || 600) / 2;
      }

      // 5. Group
      const group = new fabricModule.Group([baseCircle, whiteCircle, img], {
        left: left,
        top: top,
        originX: "center",
        originY: "center",
        cornerColor: "#28a745",
        cornerStyle: "circle",
        transparentCorners: false,
        borderColor: "#28a745",
        // Initial scale 1 because we sized the components to targetSize
        scaleX: 1,
        scaleY: 1,
      });

      canvas.add(group);
      canvas.setActiveObject(group);
      canvas.requestRenderAll();

      // Animate (Simple Pop)
      group.set({ scaleX: 0.1, scaleY: 0.1 });
      group.animate(
        { scaleX: 1, scaleY: 1 }, // Animate to 1
        {
          duration: 300,
          onChange: canvas.requestRenderAll.bind(canvas),
          easing: fabricModule.util.ease.easeOutBack,
        },
      );
    } catch (e) {
      console.error("Failed to add sticker", e);
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    const json = e.dataTransfer?.getData("text/plain");
    if (!json) return;

    try {
      const data = JSON.parse(json);
      const { image } = data;
      // Pass drop coordinates
      await addStickerToCanvas(image, e.offsetX, e.offsetY);
    } catch (e) {
      console.error("Drop failed", e);
    }
  }

  function handleStickerTap(sticker: StickerWithProfile) {
    const imageUrl = typeof sticker.image === "string" ? sticker.image : "";
    if (imageUrl) {
      addStickerToCanvas(imageUrl); // No coords = Center
    }
  }

  function togglePen() {
    if (!canvas) return;
    isPenMode = !isPenMode;
    canvas.isDrawingMode = isPenMode;
    if (isPenMode) {
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    }
  }

  function undo() {
    if (!canvas) return;
    const objects = canvas.getObjects();
    if (objects.length > 0) {
      // Remove the last added object (newest on top)
      const last = objects[objects.length - 1];
      canvas.remove(last);
      canvas.requestRenderAll();
    }
  }

  function deleteSelected() {
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    if (active.length) {
      canvas.remove(...active);
      canvas.discardActiveObject();
    }
  }

  // Background State
  let bgGradient = $state("");

  function randomizeBackground() {
    const colors = [
      "#ffe6f2",
      "#e6e6ff",
      "#e6ffff",
      "#f2ffe6",
      "#fff5e6",
      "#fdfacc",
    ];
    const c1 = colors[Math.floor(Math.random() * colors.length)];
    const c2 = colors[Math.floor(Math.random() * colors.length)];
    const angle = Math.floor(Math.random() * 360);
    bgGradient = `linear-gradient(${angle}deg, ${c1}, ${c2})`;
  }

  // Sharing
  let captureContainer: HTMLDivElement;

  async function handleShare() {
    if (!agent || !captureContainer) return;
    processing = true;

    if (canvas) {
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    }

    try {
      const canvasSnapshot = await html2canvas(captureContainer, {
        useCORS: true,
        scale: 2,
        backgroundColor: null,
      });

      const blob = await new Promise<Blob | null>((resolve) =>
        canvasSnapshot.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("Snapshot failed");

      const { data } = await agent.uploadBlob(
        new Uint8Array(await blob.arrayBuffer()),
        { encoding: "image/jpeg" },
      );

      await agent.post({
        text: "Check out my sticker collection! ✨ #あつめあっと #AtsumeAt",
        embed: {
          $type: "app.bsky.embed.images",
          images: [{ alt: "My Sticker Collection", image: data.blob }],
        },
      });

      alert("Posted to Bluesky!");
    } catch (e) {
      console.error("Share failed", e);
      alert("Failed to share. Please try again.");
    } finally {
      processing = false;
    }
  }
</script>

<div class="min-h-screen bg-surface flex flex-col items-center">
  <!-- Header -->
  <header
    class="w-full max-w-6xl p-4 flex justify-between items-center z-10 relative"
  >
    <a href="/" class="text-gray-500 hover:text-primary font-bold">← Back</a>
    <h1 class="text-xl font-bold text-primary">Sticker Deco</h1>
    <div class="w-16"></div>
    <!-- Spacer for balance -->
  </header>

  <main
    class="w-full max-w-6xl flex-1 flex flex-col md:flex-row gap-8 p-4 relative"
  >
    <!-- Canvas Area (Center) -->
    <div
      class="flex-1 flex flex-col items-center justify-center relative gap-4"
    >
      <!-- Toolbar -->
      <div class="flex gap-4 z-20">
        <button
          class="p-3 rounded-full bg-white shadow-md hover:bg-gray-50 transition-colors {isPenMode
            ? 'ring-2 ring-primary text-primary'
            : 'text-gray-600'}"
          onclick={togglePen}
          title="Pen Tool"
        >
          ✏️
        </button>
        <button
          class="p-3 rounded-full bg-white shadow-md hover:bg-gray-50 text-gray-600 transition-colors"
          onclick={undo}
          title="Undo"
        >
          ↩️
        </button>
        <button
          class="p-3 rounded-full bg-white shadow-md hover:bg-gray-50 text-red-500 transition-colors"
          onclick={deleteSelected}
          title="Delete Selected"
        >
          🗑️
        </button>
        <button
          class="p-3 rounded-full bg-white shadow-md hover:bg-gray-50 text-gray-500 transition-colors"
          onclick={randomizeBackground}
          title="Change Background"
        >
          🎨
        </button>
      </div>

      <!-- The Sticker Sheet -->
      <div
        bind:this={captureContainer}
        class="relative shadow-2xl rounded-lg overflow-hidden border-4 border-white transform transition-transform bg-white"
        style="width: 400px; height: 600px; background: {bgGradient};"
      >
        <div
          class="absolute inset-0 opacity-10 pointer-events-none"
          style="background-image: radial-gradient(circle, #fff 20%, transparent 20%); background-size: 20px 20px;"
        ></div>
        <canvas
          bind:this={canvasEl}
          width="400"
          height="600"
          class="absolute inset-0"
        ></canvas>
      </div>

      <p class="text-center text-gray-400 text-xs">
        Drag stickers here OR Tap to add • Decorate with Pen
      </p>
    </div>

    <!-- Sticker Drawer (Side/Bottom) -->
    <!-- Increased height from h-48 to h-96 for mobile -->
    <div
      class="w-full md:w-80 h-96 md:h-[600px] bg-white/80 backdrop-blur rounded-2xl border-2 border-primary/20 shadow-xl flex flex-col z-20"
    >
      <div
        class="p-4 border-b border-gray-100 flex justify-between items-center"
      >
        <h2 class="font-bold text-gray-700">My Stickers</h2>
        <span class="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full"
          >{stickers.length}</span
        >
      </div>

      <div
        class="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-2 align-content-start"
      >
        {#if stickers.length === 0}
          <div class="col-span-3 text-center py-8 text-gray-400">
            {#if agent}
              Loading stickers...
            {:else}
              Sign in to load
            {/if}
          </div>
        {:else}
          {#each stickers as sticker (sticker.uri)}
            <StickerThumb {sticker} onadd={() => handleStickerTap(sticker)} />
          {/each}
        {/if}
      </div>
    </div>
  </main>

  <!-- Post Button (Standard Flow) -->
  <div class="w-full p-8 flex justify-center pb-12">
    <button
      class="btn-primary flex items-center gap-2 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all"
      onclick={handleShare}
      disabled={processing}
    >
      {#if processing}
        <span
          class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"
        ></span>
        Posting...
      {:else}
        <span>🦋</span> Post to Bluesky
      {/if}
    </button>
  </div>
</div>
