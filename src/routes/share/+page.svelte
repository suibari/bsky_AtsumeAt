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

  import { SVG_DEFS } from "$lib/shapes";

  // ... (keeping imports)

  function getFabricShape(shape: string, width: number, height: number): any {
    if (!fabricModule) return null;

    // Helper to center object based on ViewBox conceptual center
    const alignToViewBox = (
      obj: any,
      bbox: any,
      vbW: number,
      vbH: number,
      scale: number,
    ) => {
      // Use Top-Left origin for easier calculation
      obj.set({ originX: "left", originY: "top" });

      // We want the ViewBox Center (vbW/2, vbH/2) to map to the Group Center (0,0).
      // The current Object Origin (0,0) is at bbox.left, bbox.top in unscaled coords.
      // We want the point (vbW/2, vbH/2) in unscaled coords to end up at (0,0) in parent coords.

      // So we place the object such that:
      // obj.left = (bbox.left - vbW/2) * scale
      // obj.top = (bbox.top - vbH/2) * scale
      // If bbox.left is 0 and vbW/2 is 8, obj.left is -8 * scale. Correct.

      obj.set({
        left: (bbox.left - vbW / 2) * scale,
        top: (bbox.top - vbH / 2) * scale,
        scaleX: scale,
        scaleY: scale,
      });
      return obj;
    };

    if (shape === "square") {
      return new fabricModule.Rect({
        width: width,
        height: height,
        rx: width * 0.15, // Match CSS round 15% (approx)
        ry: height * 0.15,
        originX: "center",
        originY: "center",
      });
    } else if (shape === "star") {
      // Use implicit 1x1 ViewBox for Star
      const rawPoints = [
        { x: 0.5, y: 0.0 },
        { x: 0.66, y: 0.32 },
        { x: 0.98, y: 0.35 },
        { x: 0.72, y: 0.57 },
        { x: 0.79, y: 0.91 },
        { x: 0.5, y: 0.74 },
        { x: 0.21, y: 0.91 },
        { x: 0.28, y: 0.57 },
        { x: 0.02, y: 0.35 },
        { x: 0.34, y: 0.32 },
      ];
      // Create polygon unscaled
      const ply = new fabricModule.Polygon(rawPoints, {
        originX: "left",
        originY: "top",
      });

      // ViewBox is 1x1. Target size is 'width'.
      // Resetting to standard 1.0 scale. The selection box will be rectangular (touching tips), which is unavoidable.
      return alignToViewBox(ply, ply.getBoundingRect(), 1, 1, width);
    } else if (shape === "diamond") {
      // Use implicit 1x1 ViewBox for Diamond
      const rawPoints = [
        { x: 0.5, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.5, y: 1 },
        { x: 0, y: 0.5 },
      ];
      const ply = new fabricModule.Polygon(rawPoints, {
        originX: "left",
        originY: "top",
      });
      return alignToViewBox(ply, ply.getBoundingRect(), 1, 1, width);
    } else if (SVG_DEFS[shape]) {
      const def = SVG_DEFS[shape];
      const path = new fabricModule.Path(def.d, {
        originX: "left",
        originY: "top",
      });
      // Scale based on ViewBox width vs Target Width
      const scale = width / def.viewBox[0];
      return alignToViewBox(
        path,
        path.getBoundingRect(),
        def.viewBox[0],
        def.viewBox[1],
        scale,
      );
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
      const targetSize = 150;
      const shape = sticker.shape || "circle";

      // We will create 3 layers:
      // Outer: Colored Shape (100%)
      // Inner: White Shape (92%)
      // Image: Clipped Image (96% of Inner = ~88% of Outer)

      const outerScale = 1.0;
      const innerScale = 0.92;
      const imageScaleRelativeToInner = 0.96;
      const totalImageScale = innerScale * imageScaleRelativeToInner;

      // 1. Outer Shape (Color)
      const outerObj = getFabricShape(shape, targetSize, targetSize);
      outerObj.set({
        fill: borderColor,
        stroke: null,
      });

      // 2. Inner Shape (White)
      const innerObj = getFabricShape(
        shape,
        targetSize * innerScale,
        targetSize * innerScale,
      );
      innerObj.set({
        fill: "#ffffff",
        stroke: null,
      });

      // 3. Image Setup
      // Scale image to cover the *Target Size* roughly, then we clip it.
      // But we want the image to be "inside" the inner white border.
      // The clip path should be the shape at `totalImageScale`.

      // First, scale the raw image to cover the target box
      const imgRawScale =
        (targetSize * totalImageScale) / Math.max(img.width, img.height);

      img.set({
        scaleX: imgRawScale,
        scaleY: imgRawScale,
        originX: "center",
        originY: "center",
      });

      // Create clip path object
      // Create clip path object
      const clipObj = getFabricShape(shape, img.width, img.height);
      // Clip path needs absolute positioning logic usually, but nested in group?
      // Fabric 6: clipPath is relative to object center if object is centered?
      // Actually standard clipPath is relative to object center.
      // Since 'img' origin is center, 'clipObj' origin center works perfectly.
      img.clipPath = clipObj;

      // Group them all
      // We need to position them relative to Group Center (0,0)

      const group = new fabricModule.Group([outerObj, innerObj, img], {
        originX: "center",
        originY: "center",
        subTargetCheck: false, // Treat as single object
        interactive: true,
      });

      // Apply Shadow to the GROUP (so it follows the outer shape roughly)
      // Note: Shadow on Group with transparent parts can be tricky.
      // Ideally shadow is on 'outerObj', but we want the whole thing to cast it.
      // If we put shadow on Group, it might box-shadow the bounding box if not careful?
      // Fabric shadow usually follows transparency.

      // Let's try applying shadow to the Group first.
      group.set({
        shadow: new fabricModule.Shadow({
          blur: 10,
          color: "rgba(0,0,0,0.3)",
          offsetX: 2,
          offsetY: 2,
        }),
      });

      // Calculate Position
      let left = x;
      let top = y;

      if (left === undefined || top === undefined) {
        left = (canvas.width || 400) / 2;
        top = (canvas.height || 600) / 2;
      }

      group.set({
        left: left,
        top: top,
        borderColor: "#28a745",
        cornerColor: "#28a745",
        cornerSize: 10,
        transparentCorners: false,
      });

      canvas.add(group);
      canvas.setActiveObject(group);
      canvas.requestRenderAll();

      // Animate Pop
      group.set({ scaleX: 0.1, scaleY: 0.1 });
      group.animate(
        { scaleX: 1, scaleY: 1 },
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
