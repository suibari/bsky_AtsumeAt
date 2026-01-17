<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getDominantColor } from "$lib/color";
  import { CSS_SHAPES, SVG_DEFS } from "$lib/shapes";

  // Shape Handling
  let {
    avatarUrl = "",
    staticAngle = false,
    allowVerticalRotation = false,
    shape = "circle",
  } = $props<{
    avatarUrl?: string;
    staticAngle?: boolean;
    allowVerticalRotation?: boolean;
    shape?: "circle" | "square" | "star" | "heart" | "diamond" | "butterfly";
  }>();

  let container: HTMLDivElement;
  let animationId: number;

  // Rotation State
  // Combined state: rotY includes both manual and auto components
  let rotX = $state(0);
  let rotY = $state(0);
  let isDragging = $state(false);

  let lastX = 0;
  let lastY = 0;

  // Dynamic Color State
  let borderColor = $state("transparent"); // Start transparent to avoid yellow flash

  function onPointerDown(e: MouseEvent | TouchEvent) {
    if (staticAngle) return;
    isDragging = true;
    lastX = "touches" in e ? e.touches[0].clientX : e.clientX;
    lastY = "touches" in e ? e.touches[0].clientY : e.clientY;

    // If vertical rotation is allowed (e.g. in Modal), we want to seize the touch event
    // to prevent scrolling while rotating
    if (allowVerticalRotation && "touches" in e && e.cancelable) {
      e.preventDefault();
    }
  }

  function onPointerMove(e: MouseEvent | TouchEvent) {
    if (staticAngle || !isDragging) return;

    const isTouch = "touches" in e;
    const x = isTouch ? e.touches[0].clientX : e.clientX;
    const y = isTouch ? e.touches[0].clientY : e.clientY;

    const deltaX = x - lastX;
    const deltaY = y - lastY;

    // Apply rotation
    rotY += deltaX * 0.5; // Sensitivity

    if (!isTouch || allowVerticalRotation) {
      // Only allow X-axis dragging (tilting up/down) on Mouse OR if explicitly allowed (Modal)
      rotX -= deltaY * 0.5;
      // Clamp X
      rotX = Math.max(-60, Math.min(60, rotX));

      if (isTouch && allowVerticalRotation && e.cancelable) {
        e.preventDefault();
      }
    }

    lastX = x;
    lastY = y;
  }

  function onPointerUp() {
    isDragging = false;
  }

  // Animation Loop for Auto-Rotation
  function animate() {
    if (staticAngle) return;
    animationId = requestAnimationFrame(animate);

    if (!isDragging) {
      // Simply increment the unified rotY state
      rotY += 0.5;
    }
  }

  onMount(() => {
    animate();

    // Global mouse up helper
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("touchend", onPointerUp);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("mouseup", onPointerUp);
      window.removeEventListener("touchend", onPointerUp);
    };
  });

  // Computed final rotation
  let finalRotY = $derived(rotY);
  let finalRotX = $derived(rotX);

  // Resolve Image
  const placeholder = "https://bsky.social/about/images/favicon-32x32.png";
  let displayImage = $derived(avatarUrl || placeholder);
  let proxiedImage = $derived(
    displayImage.startsWith("http")
      ? `/api/proxy?url=${encodeURIComponent(displayImage)}`
      : displayImage,
  );

  // Effect to update border color
  $effect(() => {
    if (proxiedImage) {
      const key = `sticker-color:${proxiedImage}`;
      // Try sync cache first
      try {
        const cached = localStorage.getItem(key);
        if (cached) {
          borderColor = cached;
        }
      } catch (e) {}

      // Async fetch
      getDominantColor(proxiedImage).then((c) => {
        // Only update if changed (prevents flicker if same)
        if (borderColor !== c) {
          borderColor = c;
          try {
            localStorage.setItem(key, c);
          } catch (e) {}
        }
      });
    }
  });

  // Shape Styles
  let clipStyle = $derived.by(() => {
    if (CSS_SHAPES[shape as string]) {
      return `clip-path: ${CSS_SHAPES[shape as string]}`;
    }
    if (SVG_DEFS[shape as string]) {
      return `clip-path: url(#shape-${shape})`;
    }
    return `clip-path: ${CSS_SHAPES.circle}`;
  });

  let containerStyle = $derived(clipStyle);

  // Border Simulation for clipped shapes
  // CSS 'border' gets clipped. We use a background wrapper to simulate border.
  // We apply this strategy to ALL shapes for consistency.
  let useRealBorder = false;
</script>

<div
  class="scene relative w-full h-full cursor-grab active:cursor-grabbing {allowVerticalRotation
    ? 'touch-none'
    : 'touch-pan-y'}"
  onmousedown={onPointerDown}
  onmousemove={onPointerMove}
  ontouchstart={onPointerDown}
  ontouchmove={onPointerMove}
  role="application"
>
  <div
    class="card w-full h-full relative"
    style="transform: rotateX({finalRotX}deg) rotateY({finalRotY}deg);"
  >
    <!-- Sticker Shape Wrapper -->
    <!-- We apply the shape (clip-path or border-radius) here -->
    <div
      class="face front absolute inset-0 w-full h-full flex items-center justify-center shadow-xl"
      style="{containerStyle}; {useRealBorder
        ? `border: 4px solid ${borderColor}; transition: border-color 0.3s ease;`
        : `background: ${borderColor}; transition: background-color 0.3s ease;`}"
      class:rounded-full={shape === "circle"}
      class:rounded-2xl={shape === "square"}
    >
      <!-- Content (Image + Gloss) -->
      <!-- If simple border used, image is full size. If clipped, image needs to be inset to reveal border/bg. -->
      <div
        class="relative flex items-center justify-center"
        style={`width: 92%; height: 92%; ${containerStyle}; background: white;`}
      >
        <img
          src={proxiedImage}
          alt="Sticker"
          class="object-cover"
          style={`width: 96%; height: 96%; ${containerStyle};`}
          draggable="false"
        />

        <!-- Gloss Overlay -->
        <div
          class="gloss absolute inset-0 w-full h-full pointer-events-none z-10"
          style="
            background: linear-gradient(115deg, transparent 40%, rgba(255, 255, 255, 0.7) 50%, transparent 60%); 
            background-size: 200% 100%;
            background-position: {100 -
            ((((finalRotY % 360) + 360) % 360) / 360) * 200}%;
            mix-blend-mode: overlay;
          "
        ></div>

        <!-- Specular Highlight (Static) -->
        <div
          class="absolute inset-0 ring-1 ring-inset ring-white/50 z-20"
          class:rounded-full={shape === "circle"}
          class:rounded-xl={shape === "square"}
          style={!useRealBorder ? containerStyle : ""}
        ></div>
      </div>
    </div>

    <!-- Back Face -->
    <div
      class="face back absolute inset-0 w-full h-full flex items-center justify-center border-4 border-white shadow-xl"
      style="
          transform: rotateY(180deg); 
          background-color: {borderColor};
          background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 20px);
          transition: background-color 0.3s ease;
          {containerStyle}
        "
      class:rounded-full={shape === "circle"}
      class:rounded-2xl={shape === "square"}
    >
      <div
        class="w-2/3 h-2/3 bg-white/20 animate-pulse"
        class:rounded-full={shape === "circle"}
        class:rounded-xl={shape === "square"}
        style={!useRealBorder ? containerStyle : ""}
      ></div>
    </div>
  </div>
</div>

<svg width="0" height="0" class="absolute pointer-events-none opacity-0">
  <defs>
    {#each Object.entries(SVG_DEFS) as [name, def]}
      <clipPath id="shape-{name}" clipPathUnits="objectBoundingBox">
        <path
          d={def.d}
          transform="scale({1 / def.viewBox[0]}, {1 / def.viewBox[1]})"
        />
      </clipPath>
    {/each}
  </defs>
</svg>

<style>
  .scene {
    perspective: 800px;
  }
  .card {
    transform-style: preserve-3d;
    transition: transform 0.1s cubic-bezier(0, 0, 0.2, 1);
  }
  .face {
    backface-visibility: hidden;
    /* Hardware acceleration hints */
    -webkit-font-smoothing: antialiased;
  }
</style>
