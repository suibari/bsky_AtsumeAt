<script lang="ts">
  import type { StickerWithProfile } from "$lib/stickers";
  import StickerCanvas from "$lib/components/StickerCanvas.svelte";

  let { sticker, onadd } = $props<{
    sticker: StickerWithProfile;
    onadd?: (sticker: StickerWithProfile) => void;
  }>();

  function onDragStart(e: DragEvent) {
    if (!e.dataTransfer) return;

    // Pass sticker data as JSON string
    e.dataTransfer.setData(
      "text/plain",
      JSON.stringify({
        uri: sticker.uri,
        image: sticker.image,
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
  }

  function handleClick() {
    if (onadd) onadd(sticker);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }
</script>

<div
  role="button"
  tabindex="0"
  draggable="true"
  ondragstart={onDragStart}
  onclick={handleClick}
  onkeydown={handleKeyDown}
  class="cursor-grab active:cursor-grabbing hover:scale-105 transition-transform w-20 h-20 relative active:scale-95 touch-manipulation"
  title="Drag or Tap to Add"
  aria-label="Add sticker {sticker.name || 'Unknown'}"
>
  <StickerCanvas
    avatarUrl={typeof sticker.image === "string" ? sticker.image : ""}
    staticAngle={true}
  />
</div>
