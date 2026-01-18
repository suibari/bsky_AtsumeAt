<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import StickerCanvas from "./StickerCanvas.svelte";
  import type { StickerWithProfile } from "$lib/stickers";
  import { settings } from "$lib/settings.svelte";
  import type { Agent } from "@atproto/api";
  import { CSS_SHAPES, SVG_DEFS } from "$lib/shapes";

  let { sticker, agent, isOpen, onclose, onupdate } = $props<{
    sticker: StickerWithProfile | null;
    agent: Agent;
    isOpen: boolean;
    onclose: () => void;
    onupdate: (
      sticker: StickerWithProfile,
      updates: Partial<StickerWithProfile>,
    ) => Promise<void>;
  }>();

  let isEditing = $state(false);
  let editName = $state("");
  let editTags = $state<string[]>([]);
  let editShape = $state<
    "circle" | "square" | "star" | "heart" | "diamond" | "butterfly"
  >("circle");
  let newTagInput = $state("");
  let isSaving = $state(false);

  // Initialize edit state when sticker opens
  $effect(() => {
    if (sticker && isOpen) {
      editName = sticker.name || "";
      editTags = sticker.tags ? [...sticker.tags] : [];
      editShape = (sticker.shape as any) || "circle";
      isEditing = false;
      isSaving = false;
    }
  });

  async function handleSave() {
    if (!sticker) return;
    isSaving = true;
    try {
      // Diff check
      const updates: any = {};
      if (editName !== (sticker.name || "")) updates.name = editName;
      if (editShape !== (sticker.shape || "circle")) updates.shape = editShape;
      // Simple array compare
      const sortedOld = (sticker.tags || []).slice().sort().join(",");
      const sortedNew = editTags.slice().sort().join(",");
      if (sortedOld !== sortedNew) updates.tags = editTags;

      if (Object.keys(updates).length > 0) {
        await onupdate(sticker, updates);
      }
      isEditing = false;
    } catch (e) {
      alert("Failed to update sticker");
      console.error(e);
    } finally {
      isSaving = false;
    }
  }

  function addTag() {
    const val = newTagInput.trim();
    if (val && !editTags.includes(val)) {
      editTags = [...editTags, val];
      newTagInput = "";
    }
  }

  function removeTag(tag: string) {
    editTags = editTags.filter((t) => t !== tag);
  }

  // Can edit tags? Only if I own the sticker record (it's in my library)
  // Can edit name? Only if I am the ORIGINAL MINTER (originalOwner == me) AND I own the record.
  // Actually, wait. Since I re-sign the name, I can technically rename ANY sticker I mint.
  // But if I am just a holder of someone else's sticker, I cannot rename it without invalidating the seal (unless the seal allows it, which it doesn't currently).
  // The updateSticker logic throws error if signature fails. Signature fails if I am not the issuer (unless I became the issuer?).
  // For now: Only allow rename if originalOwner === agent.assertDid.

  let canEditName = $derived(sticker?.originalOwner === agent.assertDid);
</script>

{#if isOpen && sticker}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    transition:fade={{ duration: 200 }}
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={onclose}
      role="button"
      tabindex="0"
      onkeydown={(e) => e.key === "Escape" && onclose()}
    ></div>

    <!-- Modal Content -->
    <div
      class="relative w-full max-w-lg bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      transition:scale={{ duration: 300, easing: quintOut, start: 0.9 }}
      role="dialog"
      aria-modal="true"
    >
      <!-- Header / Close -->
      <button
        onclick={onclose}
        class="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 z-10 rounded-full hover:bg-gray-100/50 transition-colors"
        aria-label="Close Modal"
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
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      <!-- Scrollable Content -->
      <div
        class="overflow-y-auto overflow-x-hidden p-6 sm:p-8 space-y-6 scrollbar-hide"
      >
        <!-- Large 3D View -->
        <div
          class="w-full aspect-square max-w-[280px] mx-auto relative group cursor-grab active:cursor-grabbing"
        >
          <StickerCanvas
            avatarUrl={typeof sticker.image === "string" ? sticker.image : ""}
            allowVerticalRotation={true}
            shape={isEditing && editShape
              ? editShape
              : sticker.shape || "circle"}
          />
          <div
            class="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          >
            Drag to Rotate
          </div>
        </div>

        <!-- Info Section -->
        <div class="text-center space-y-2">
          {#if isEditing && canEditName}
            <input
              type="text"
              bind:value={editName}
              class="text-2xl font-bold text-center text-gray-800 bg-transparent border-b-2 border-primary/20 focus:border-primary outline-none w-full"
              placeholder="Sticker Name"
            />

            <!-- Shape Editor -->
            <div class="flex gap-2 justify-center mt-2">
              {#each ["circle", "square", "star", "heart", "diamond", "butterfly"] as s}
                <button
                  class="w-8 h-8 rounded-lg border flex items-center justify-center transition-all {editShape ===
                  s
                    ? 'border-primary bg-primary/10'
                    : 'border-gray-200 hover:border-gray-300'}"
                  onclick={() => (editShape = s as any)}
                  title={s}
                >
                  {#if s === "circle"}
                    <div class="w-4 h-4 bg-gray-400 rounded-full"></div>
                  {:else if s === "square"}
                    <div class="w-4 h-4 bg-gray-400 rounded-sm"></div>
                  {:else if CSS_SHAPES[s]}
                    <div
                      class="w-4 h-4 bg-gray-400"
                      style="clip-path: {CSS_SHAPES[s]}"
                    ></div>
                  {:else if SVG_DEFS[s]}
                    <svg
                      viewBox="0 0 {SVG_DEFS[s].viewBox[0]} {SVG_DEFS[s]
                        .viewBox[1]}"
                      class="w-5 h-5 fill-gray-400"
                    >
                      <path d={SVG_DEFS[s].d} />
                    </svg>
                  {/if}
                </button>
              {/each}
            </div>
          {:else}
            <h2 class="text-2xl font-bold text-gray-800">
              {sticker.name ||
                settings.t.stickerBook.defaultName.replace(
                  "{name}",
                  sticker.originalOwnerProfile?.displayName ||
                    sticker.originalOwnerProfile?.handle ||
                    sticker.originalOwner ||
                    "Unknown",
                )}
            </h2>
          {/if}

          <div class="text-sm text-gray-500 flex flex-col gap-1 items-center">
            {#if sticker.originalOwnerProfile}
              <span
                >Minter: <span class="font-medium text-primary"
                  >{sticker.originalOwnerProfile.displayName ||
                    sticker.originalOwnerProfile.handle}</span
                ></span
              >
            {/if}
            {#if sticker.obtainedAt}
              <span class="text-xs text-gray-400"
                >Obtained: {new Date(
                  sticker.obtainedAt,
                ).toLocaleDateString()}</span
              >
            {/if}
          </div>
        </div>

        <!-- Tags Section -->
        <div class="space-y-3">
          <h3
            class="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z"
                clip-rule="evenodd"
              />
            </svg>
            Tags
          </h3>

          <div class="flex flex-wrap gap-2">
            {#if isEditing}
              <div class="w-full text-xs text-gray-400 mb-1">
                ※ {settings.t.stickerViewer.tagsPublicInfo}
              </div>
              {#each editTags as tag}
                <span
                  class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary"
                >
                  #{tag}
                  <button
                    onclick={() => removeTag(tag)}
                    class="ml-1.5 text-primary/60 hover:text-primary p-0.5"
                    aria-label="Remove Tag"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-3 w-3"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </button>
                </span>
              {/each}
              <div class="flex items-center">
                <input
                  type="text"
                  bind:value={newTagInput}
                  placeholder="Add tag..."
                  class="px-3 py-1 text-sm bg-gray-50 border border-transparent focus:bg-white focus:border-primary rounded-full outline-none w-24 transition-all"
                  onkeydown={(e) => e.key === "Enter" && addTag()}
                />
                <button
                  onclick={addTag}
                  class="ml-2 text-primary hover:bg-primary/10 p-1 rounded-full"
                  aria-label="Add Tag"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            {:else if (sticker.tags?.length || 0) > 0}
              {#each sticker.tags || [] as tag}
                <span
                  class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600"
                >
                  #{tag}
                </span>
              {/each}
            {:else}
              <span class="text-sm text-gray-400 italic">No tags</span>
            {/if}
          </div>
        </div>

        {#if sticker.message}
          <div class="bg-yellow-50 p-4 rounded-xl border border-yellow-100/50">
            <p class="text-gray-600 italic text-center">"{sticker.message}"</p>
          </div>
        {/if}
      </div>

      <!-- Footer Actions -->
      <!-- Only show Edit if it's MY sticker (in my inventory) -->
      <!-- Assuming sticker.uri starts with at://myDid ... wait, sticker.uri is passed in. -->
      <!-- We check ownership by repo of the URI or just assume caller handles perms? -->
      <!-- Assuming owner is agent.assertDid. -->
      {#if agent.assertDid && sticker.uri.includes(agent.assertDid)}
        <div
          class="p-4 bg-gray-50/80 border-t border-gray-100 flex justify-between items-center"
        >
          {#if isEditing}
            <button
              onclick={() => (isEditing = false)}
              class="px-4 py-2 text-gray-500 hover:text-gray-700 font-medium"
              disabled={isSaving}
            >
              {settings.t.common.cancel}
            </button>
            <button
              onclick={handleSave}
              disabled={isSaving}
              class="px-6 py-2 bg-primary text-white rounded-full font-bold shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {#if isSaving}
                <div
                  class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                ></div>
                {settings.t.common.saving}
              {:else}
                {settings.t.stickerViewer.saveChanges}
              {/if}
            </button>
          {:else}
            <div class="text-xs text-gray-400 flex flex-col">
              {#if !sticker.verification?.isValid}
                <span class="text-red-400">Unverified</span>
              {/if}
            </div>
            <button
              onclick={() => (isEditing = true)}
              class="px-6 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 rounded-full font-bold transition-all shadow-sm"
            >
              {settings.t.stickerViewer.editDetails}
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
