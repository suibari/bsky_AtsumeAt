<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getClient, publicAgent } from "$lib/atproto";
  import { Agent, RichText } from "@atproto/api";
  import type { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
  import { getUserStickers, type StickerWithProfile } from "$lib/stickers";
  import StickerThumb from "./StickerThumb.svelte";
  import html2canvas from "html2canvas";
  import { getDominantColor } from "$lib/color";
  import StickerCanvas from "$lib/components/StickerCanvas.svelte";
  import { i18n } from "$lib/i18n.svelte";
  import { fade } from "svelte/transition";

  let agent = $state<Agent | null>(null);
  let stickers = $state<StickerWithProfile[]>([]);
  let canvas: any; // Fabric Canvas
  let canvasEl: HTMLCanvasElement;
  let processing = $state(false);
  let isPenMode = $state(false);
  let postText = $state(i18n.t.share.defaultPostText);
  let altText = $state("");
  let currentUserProfile = $state<ProfileViewDetailed | null>(null);
  let showToast = $state(false);

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
          const [stickersRes, profileRes] = await Promise.all([
            getUserStickers(agent, agent.assertDid!),
            publicAgent.getProfile({ actor: agent.assertDid! }),
          ]);
          stickers = stickersRes;
          currentUserProfile = profileRes.data;
          const name =
            currentUserProfile.displayName || currentUserProfile.handle;
          altText = i18n.t.share.altDefault.replace("{name}", name);
        } catch (e) {
          console.error("Failed to load data", e);
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

  function getClipPathForShape(
    shape: string,
    width: number,
    height: number,
  ): fabric.Object {
    if (shape === "square") {
      return new fabricModule.Rect({
        width: width,
        height: height,
        rx: 16, // Rounded corners
        ry: 16,
        originX: "center",
        originY: "center",
      });
    } else if (shape === "star") {
      // Fat star polygon 0-1 coords scaled
      // 50% 0%, 63% 38%, 100% 38%, 69% 59%, 82% 100%, 50% 75%, 18% 100%, 31% 59%, 0% 38%, 37% 38%
      const points = [
        { x: 0.5, y: 0.0 },
        { x: 0.63, y: 0.38 },
        { x: 1.0, y: 0.38 },
        { x: 0.69, y: 0.59 },
        { x: 0.82, y: 1.0 },
        { x: 0.5, y: 0.75 },
        { x: 0.18, y: 1.0 },
        { x: 0.31, y: 0.59 },
        { x: 0.0, y: 0.38 },
        { x: 0.37, y: 0.38 },
      ].map((p) => ({ x: (p.x - 0.5) * width, y: (p.y - 0.5) * height }));

      return new fabricModule.Polygon(points, {
        originX: "center",
        originY: "center",
      });
    } else if (shape === "diamond") {
      const points = [
        { x: 0, y: -height / 2 },
        { x: width / 2, y: 0 },
        { x: 0, y: height / 2 },
        { x: -width / 2, y: 0 },
      ];
      return new fabricModule.Polygon(points, {
        originX: "center",
        originY: "center",
      });
    } else if (shape === "heart") {
      const pathData =
        "M0.5,0.95 C0.5,0.95 0.1,0.65 0.1,0.35 C0.1,0.15 0.25,0.05 0.4,0.1 C0.48,0.13 0.5,0.2 0.5,0.2 C0.5,0.2 0.52,0.13 0.6,0.1 C0.75,0.05 0.9,0.15 0.9,0.35 C0.9,0.65 0.5,0.95 0.5,0.95 Z";
      const path = new fabricModule.Path(pathData, {
        originX: "center",
        originY: "center",
      });
      const bounds = path.getBoundingRect();
      const scaleX = width / bounds.width;
      const scaleY = height / bounds.height;
      path.set({ scaleX, scaleY });
      return path;
    } else if (shape === "butterfly") {
      const pathData =
        "M0.5 0.53 L 0.55 0.45 C 0.7 0.2 0.9 0.1 0.95 0.3 C 0.98 0.4 0.9 0.55 0.75 0.65 C 0.85 0.7 0.95 0.8 0.85 0.9 C 0.75 1.0 0.6 0.9 0.5 0.8 C 0.4 0.9 0.25 1.0 0.15 0.9 C 0.05 0.8 0.15 0.7 0.25 0.65 C 0.1 0.55 0.02 0.4 0.05 0.3 C 0.1 0.1 0.3 0.2 0.45 0.45 Z";
      const path = new fabricModule.Path(pathData, {
        originX: "center",
        originY: "center",
      });
      const bounds = path.getBoundingRect();
      const scaleX = width / bounds.width;
      const scaleY = height / bounds.height;
      path.set({ scaleX, scaleY });
      return path;
    }

    // Default Circle
    return new fabricModule.Circle({
      radius: width / 2,
      originX: "center",
      originY: "center",
    });
  }

  // Core Logic: Add Sticker to Canvas
  async function addStickerToCanvas(sticker: any, x?: number, y?: number) {
    if (!canvas || !fabricModule) return;

    let imgUrl = typeof sticker.image === "string" ? sticker.image : "";
    if (imgUrl.startsWith("http")) {
      imgUrl = `/api/proxy?url=${encodeURIComponent(imgUrl)}`;
    }

    if (!imgUrl) return;

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
      const borderWidth = 0; // Disable border for now for custom shapes, or use stroke on image
      // For now, simpler rendering without the complex colored border wrapper for all shapes
      // Or we can try to apply border if circle/square.

      // Scale image to fit target size
      const imgScale = targetSize / Math.max(img.width, img.height);
      const shape = sticker.shape || "circle";

      img.set({
        scaleX: imgScale,
        scaleY: imgScale,
        originX: "center",
        originY: "center",
        borderColor: "#28a745",
        cornerColor: "#28a745",
        cornerSize: 10,
        transparentCorners: false,
      });

      // Apply Clip Path based on Shape
      const clip = getClipPathForShape(
        shape,
        img.width || 100,
        img.height || 100,
      );
      img.clipPath = clip;

      // Add simple shadow
      img.item(0)?.set({
        shadow: new fabricModule.Shadow({
          blur: 10,
          color: "rgba(0,0,0,0.3)",
          offsetX: 2,
          offsetY: 2,
        }),
      });
      // The image itself is the object.
      img.shadow = new fabricModule.Shadow({
        blur: 10,
        color: "rgba(0,0,0,0.3)",
        offsetX: 2,
        offsetY: 2,
      });

      // Calculate Position
      let left = x;
      let top = y;

      if (left === undefined || top === undefined) {
        left = (canvas.width || 400) / 2;
        top = (canvas.height || 600) / 2;
      }

      img.set({
        left: left,
        top: top,
      });

      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.requestRenderAll();

      // Animate (Simple Pop)
      img.set({ scaleX: 0.1, scaleY: 0.1 });
      img.animate(
        { scaleX: imgScale, scaleY: imgScale }, // Animate to target scale
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
      // Pass full date object (it has image and shape)
      await addStickerToCanvas(data, e.offsetX, e.offsetY);
    } catch (e) {
      console.error("Drop failed", e);
    }
  }

  function handleStickerTap(sticker: StickerWithProfile) {
    addStickerToCanvas(sticker); // No coords = Center
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
      canvas.renderAll();
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

      const rt = new RichText({ text: postText });
      await rt.detectFacets(agent);

      const defaultAlt = i18n.t.share.myCollection;

      await agent.post({
        text: rt.text,
        facets: rt.facets,
        embed: {
          $type: "app.bsky.embed.images",
          images: [
            {
              alt: altText || defaultAlt,
              image: data.blob,
              aspectRatio: { width: 400, height: 600 },
            },
          ],
        },
      });

      showToast = true;
      setTimeout(() => (showToast = false), 3000);
    } catch (e) {
      console.error("Share failed", e);
      alert(i18n.t.share.failed);
    } finally {
      processing = false;
    }
  }
</script>

<div class="min-h-screen bg-surface flex flex-col items-center">
  <header
    class="w-full max-w-6xl p-4 flex justify-between items-center z-10 relative"
  >
    <a href="/" class="text-gray-500 hover:text-primary font-bold"
      >← {i18n.t.common.back}</a
    >
    <h1 class="text-xl font-bold text-primary">{i18n.t.share.title}</h1>
    <div class="w-16"></div>
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
          title={i18n.t.share.penTool}
        >
          ✏️
        </button>
        <button
          class="p-3 rounded-full bg-white shadow-md hover:bg-gray-50 text-gray-600 transition-colors"
          onclick={undo}
          title={i18n.t.share.undo}
        >
          ↩️
        </button>
        <button
          class="p-3 rounded-full bg-white shadow-md hover:bg-gray-50 text-red-500 transition-colors"
          onclick={deleteSelected}
          title={i18n.t.share.delete}
        >
          🗑️
        </button>
        <button
          class="p-3 rounded-full bg-white shadow-md hover:bg-gray-50 text-gray-500 transition-colors"
          onclick={randomizeBackground}
          title={i18n.t.share.changeBg}
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
        {i18n.t.share.guide}
      </p>
    </div>

    <!-- Sticker Drawer (Side/Bottom) -->
    <div
      class="w-full md:w-80 h-[600px] bg-white/80 backdrop-blur rounded-2xl border-2 border-primary/20 shadow-xl flex flex-col z-20"
    >
      <div
        class="p-4 border-b border-gray-100 flex justify-between items-center"
      >
        <h2 class="font-bold text-gray-700">{i18n.t.share.myStickers}</h2>
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
              {i18n.t.share.loadingStickers}
            {:else}
              {i18n.t.share.signInToLoad}
            {/if}
          </div>
        {:else}
          {#each stickers as sticker (sticker.uri)}
            <StickerThumb {sticker} onadd={() => handleStickerTap(sticker)} />
          {/each}
        {/if}
      </div>

      <!-- Footer Post Controls -->
      <div class="p-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl">
        <label
          for="alt-text"
          class="block mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider"
        >
          ALT Text
        </label>
        <input
          id="alt-text"
          type="text"
          bind:value={altText}
          class="w-full p-2 mb-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
          placeholder={i18n.t.share.myCollection}
        />

        <label
          for="post-text"
          class="block mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider"
        >
          Post Text
        </label>
        <textarea
          id="post-text"
          bind:value={postText}
          class="w-full h-20 p-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none mb-3"
        ></textarea>
        <button
          class="w-full bg-primary text-white font-bold py-3 rounded-xl shadow-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          onclick={handleShare}
          disabled={processing}
        >
          {#if processing}
            <div
              class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"
            ></div>
            {i18n.t.share.posting}
          {:else}
            <span>✨</span> {i18n.t.share.postToBluesky}
          {/if}
        </button>
      </div>
    </div>
  </main>

  {#if showToast}
    <div
      class="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full font-bold shadow-2xl z-[1000] flex items-center gap-2"
      transition:fade
    >
      <span>✅</span>
      {i18n.t.share.posted}
    </div>
  {/if}
</div>
